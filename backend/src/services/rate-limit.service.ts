import { redis } from "../config/redis";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
  reason?:
    | "hourly-limit"
    | "minimum-delay";
  reservationId?: string;
}

/*
 * Reserve a send slot.
 *
 * The reservation is temporary:
 *
 * reserve → SMTP send → commit on success
 *                       ↓
 *                    release on failure
 *
 * Redis Lua keeps the reservation decision
 * atomic across multiple BullMQ workers.
 */
export async function reserveSendSlot(
  senderId: string,
  hourlyLimit: number,
  minDelayMs: number
): Promise<RateLimitResult> {
  const now = Date.now();

  const safeHourlyLimit =
    Math.max(
      1,
      Math.floor(hourlyLimit)
    );

  const safeMinDelayMs =
    Math.max(
      0,
      Math.floor(minDelayMs)
    );

  const hourWindow =
    Math.floor(
      now / 3600000
    );

  const rateKey =
    `email-rate:${senderId}:${hourWindow}`;

  const lastSuccessfulSendKey =
    `email:last-successful-send:${senderId}`;

  const reservationId =
    `${senderId}:${now}:${Math.random()
      .toString(36)
      .slice(2)}`;

  const reservationKey =
    `email-reservation:${senderId}:${hourWindow}:${reservationId}`;

  /*
   * Redis Lua:
   *
   * 1. Check minimum delay since the last
   *    SUCCESSFUL email.
   *
   * 2. Check hourly limit.
   *
   * 3. Increment hourly reservation count.
   *
   * 4. Store this exact reservation.
   *
   * All four operations are atomic.
   */
  const script = `
    local now =
      tonumber(ARGV[1])

    local minDelay =
      tonumber(ARGV[2])

    local hourlyLimit =
      tonumber(ARGV[3])

    local hourTtl =
      tonumber(ARGV[4])

    local reservationKey =
      ARGV[5]

    local lastSuccessfulSend =
      redis.call(
        "GET",
        KEYS[1]
      )

    /*
     * Minimum delay is measured from
     * the last successful send.
     */
    if lastSuccessfulSend then

      local elapsed =
        now -
        tonumber(
          lastSuccessfulSend
        )

      if elapsed < minDelay then

        return {
          0,
          minDelay - elapsed,
          1
        }

      end

    end

    /*
     * Check current hourly reservations.
     */
    local currentCount =
      tonumber(
        redis.call(
          "GET",
          KEYS[2]
        ) or "0"
      )

    if currentCount >= hourlyLimit then

      return {
        0,
        hourTtl * 1000,
        2
      }

    end

    /*
     * Reserve one hourly slot.
     */
    local newCount =
      redis.call(
        "INCR",
        KEYS[2]
      )

    /*
     * Expire the hourly counter.
     */
    if newCount == 1 then

      redis.call(
        "EXPIRE",
        KEYS[2],
        hourTtl + 60
      )

    end

    /*
     * Store the individual reservation.
     */
    redis.call(
      "SET",
      reservationKey,
      "reserved",
      "EX",
      hourTtl + 60
    )

    return {
      1,
      0,
      0
    }
  `;

  const secondsUntilHourEnds =
    Math.max(
      1,
      Math.ceil(
        (
          (
            hourWindow + 1
          ) *
            3600000 -
          now
        ) / 1000
      )
    );

  const result =
    (await redis.eval(
      script,

      2,

      lastSuccessfulSendKey,

      rateKey,

      now,

      safeMinDelayMs,

      safeHourlyLimit,

      secondsUntilHourEnds,

      reservationKey
    )) as [
      number,
      number,
      number
    ];

  const [
    allowed,
    retryAfterMs,
    reasonCode
  ] = result;

  if (
    allowed === 1
  ) {
    return {
      allowed: true,

      retryAfterMs: 0,

      reservationId
    };
  }

  return {
    allowed: false,

    retryAfterMs:
      Math.max(
        Number(
          retryAfterMs
        ),
        100
      ),

    reason:
      reasonCode === 2
        ? "hourly-limit"
        : "minimum-delay"
  };
}

/*
 * Commit a successful send.
 *
 * This converts the temporary reservation into
 * a completed send.
 */
export async function commitSendSlot(
  senderId: string,
  reservationId: string
): Promise<void> {
  const now = Date.now();

  const hourWindow =
    Math.floor(
      now / 3600000
    );

  const rateKey =
    `email-rate:${senderId}:${hourWindow}`;

  const reservationKey =
    `email-reservation:${senderId}:${hourWindow}:${reservationId}`;

  const lastSuccessfulSendKey =
    `email:last-successful-send:${senderId}`;

  /*
   * Only commit if this reservation still exists.
   *
   * The operation is atomic.
   */
  const script = `
    local reservationKey =
      KEYS[1]

    local lastSuccessfulSendKey =
      KEYS[2]

    local exists =
      redis.call(
        "EXISTS",
        reservationKey
      )

    if exists == 0 then
      return 0
    end

    /*
     * Remove temporary reservation.
     *
     * The hourly counter stays unchanged because
     * the send was successful.
     */
    redis.call(
      "DEL",
      reservationKey
    )

    /*
     * Record the successful send time.
     */
    redis.call(
      "SET",
      lastSuccessfulSendKey,
      ARGV[1]
    )

    return 1
  `;

  await redis.eval(
    script,

    2,

    reservationKey,

    lastSuccessfulSendKey,

    now
  );
}

/*
 * Release a failed reservation.
 *
 * This removes only the reservation belonging
 * to the current email and decrements the
 * hourly count atomically.
 */
export async function releaseSendSlot(
  senderId: string,
  reservationId: string
): Promise<void> {
  const now = Date.now();

  const hourWindow =
    Math.floor(
      now / 3600000
    );

  const rateKey =
    `email-rate:${senderId}:${hourWindow}`;

  const reservationKey =
    `email-reservation:${senderId}:${hourWindow}:${reservationId}`;

  const script = `
    local reservationKey =
      KEYS[1]

    local rateKey =
      KEYS[2]

    /*
     * Check whether this exact reservation
     * still exists.
     */
    local exists =
      redis.call(
        "EXISTS",
        reservationKey
      )

    if exists == 0 then
      return 0
    end

    /*
     * Remove this reservation.
     */
    redis.call(
      "DEL",
      reservationKey
    )

    /*
     * Return the hourly slot because
     * the email was not successfully sent.
     */
    local currentCount =
      tonumber(
        redis.call(
          "GET",
          rateKey
        ) or "0"
      )

    if currentCount > 0 then

      redis.call(
        "DECR",
        rateKey
      )

    end

    return 1
  `;

  await redis.eval(
    script,

    2,

    reservationKey,

    rateKey,

    now
  );
}