"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState
} from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000";

interface Sender {
  id: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
}

interface DashboardData {
  user: User;
  stats: {
    scheduled: number;
    sent: number;
    senders: number;
  };
  senders: Sender[];
}

interface ScheduledEmail {
  id: string;
  recipient: string;
  subject: string;
  body?: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: string;
  sender?: {
    email: string;
  };
}

function extractEmails(text: string): string[] {
  const matches =
    text.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
    ) || [];

  return [
    ...new Set(
      matches.map((email) =>
        email.trim().toLowerCase()
      )
    )
  ];
}

export default function Home() {
  const [dashboard, setDashboard] =
    useState<DashboardData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [activeTab, setActiveTab] =
    useState<
      "dashboard" | "compose" | "scheduled" | "sent" | "search"
    >("dashboard");

  /*
   * ==================================================
   * COMPOSE STATE
   * ==================================================
   */

  const [senderId, setSenderId] =
    useState("");

  const [subject, setSubject] =
    useState("");

  const [body, setBody] =
    useState("");

  const [recipientText, setRecipientText] =
    useState("");

  const [startTime, setStartTime] =
    useState("");

  const [delaySeconds, setDelaySeconds] =
    useState("2");

  const [hourlyLimit, setHourlyLimit] =
    useState("100");

  const [scheduling, setScheduling] =
    useState(false);

  const [scheduleMessage, setScheduleMessage] =
    useState("");

  const [scheduleError, setScheduleError] =
    useState("");

  /*
   * ==================================================
   * SENDER STATE
   * ==================================================
   */

  const [showSenderForm, setShowSenderForm] =
    useState(false);

  const [editingSenderId, setEditingSenderId] =
    useState<string | null>(null);

  const [senderEmail, setSenderEmail] =
    useState("");

  const [smtpHost, setSmtpHost] =
    useState("smtp.ethereal.email");

  const [smtpPort, setSmtpPort] =
    useState("587");

  const [smtpUser, setSmtpUser] =
    useState("");

  const [smtpPassword, setSmtpPassword] =
    useState("");

  const [addingSender, setAddingSender] =
    useState(false);

  const [senderMessage, setSenderMessage] =
    useState("");

  const [senderError, setSenderError] =
    useState("");

  /*
   * ==================================================
   * EMAIL STATE
   * ==================================================
   */

  const [emails, setEmails] =
    useState<ScheduledEmail[]>([]);

  const [emailsLoading, setEmailsLoading] =
    useState(false);

  const [emailsError, setEmailsError] =
    useState("");

  /*
   * ==================================================
   * SEARCH STATE
   * ==================================================
   */

  const [searchQuery, setSearchQuery] =
    useState("");

  const [searchResults, setSearchResults] =
    useState<any[]>([]);

  const [searchLoading, setSearchLoading] =
    useState(false);

  const [searchError, setSearchError] =
    useState("");

  /*
   * ==================================================
   * SLACK STATE
   * ==================================================
   */

  const [slackConnected, setSlackConnected] =
    useState(false);

  const [slackLoading, setSlackLoading] =
    useState(true);

  /*
   * ==================================================
   * RECIPIENT COUNT
   * ==================================================
   */

  const recipientCount = useMemo(
    () =>
      extractEmails(recipientText).length,
    [recipientText]
  );

  /*
   * ==================================================
   * LOAD DASHBOARD
   * ==================================================
   */

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");

      const response =
        await fetch(
          `${API_URL}/api/dashboard`,
          {
            method: "GET",
            credentials: "include",
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        );

      if (!response.ok) {
        if (response.status === 401) {
          setDashboard(null);
          return;
        }

        throw new Error(
          "Failed to load dashboard"
        );
      }

      const data =
        await response.json();

      setDashboard(data);

      if (
        data.senders?.length > 0 &&
        !senderId
      ) {
        setSenderId(
          data.senders[0].id
        );
      }
    } catch (err) {
      console.error(err);

      setError(
        "Unable to connect to the backend."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadEmails(
    type: "scheduled" | "sent"
  ) {
    try {
      setEmailsLoading(true);
      setEmailsError("");

      const response = await fetch(
        `${API_URL}/api/emails/${type}`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          cache: "no-store"
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            `Failed to load ${type} emails`
        );
      }

      setEmails(
        Array.isArray(data.emails)
          ? data.emails
          : []
      );
    } catch (err) {
      console.error(
        `Load ${type} emails error:`,
        err
      );

      setEmailsError(
        err instanceof Error
          ? err.message
          : `Failed to load ${type} emails`
      );

      setEmails([]);
    } finally {
      setEmailsLoading(false);
    }
  }

  useEffect(() => {
    if (
      activeTab === "scheduled" ||
      activeTab === "sent"
    ) {
      loadEmails(activeTab);
    }
  }, [activeTab]);

  async function handleSearch(
    event: FormEvent
  ) {
    event.preventDefault();

    const query =
      searchQuery.trim();

    if (!query) {
      setSearchResults([]);
      setSearchError(
        "Enter something to search."
      );
      return;
    }

    try {
      setSearchLoading(true);
      setSearchError("");

      const response =
        await fetch(
          `${API_URL}/api/emails/search?q=${encodeURIComponent(
            query
          )}`,
          {
            method: "GET",
            credentials: "include"
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Search failed"
        );
      }

      setSearchResults(
        Array.isArray(data.results)
          ? data.results
          : []
      );
    } catch (err) {
      console.error(
        "Email search error:",
        err
      );

      setSearchResults([]);
      setSearchError(
        err instanceof Error
          ? err.message
          : "Search failed"
      );
    } finally {
      setSearchLoading(false);
    }
  }


  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const slackResult =
      params.get("slack");

    if (slackResult === "connected") {
      setSlackConnected(true);

      window.history.replaceState(
        {},
        "",
        window.location.pathname
      );
    }

    if (slackResult === "error") {
      alert(
        "Slack connection failed. Please try again."
      );

      window.history.replaceState(
        {},
        "",
        window.location.pathname
      );
    }
  }, []);

  /*
   * ==================================================
   * SLACK STATUS
   * ==================================================
   */

  async function loadSlackStatus() {
    try {
      setSlackLoading(true);

      const response = await fetch(
        `${API_URL}/api/slack/status`,
        {
          method: "GET",
          credentials: "include"
        }
      );

      if (!response.ok) {
        setSlackConnected(false);
        return;
      }

      const data = await response.json();

      setSlackConnected(
        Boolean(
          data.connected ??
            data.slackConnected ??
            data.isConnected
        )
      );
    } catch (err) {
      console.error(
        "Slack status error:",
        err
      );

      setSlackConnected(false);
    } finally {
      setSlackLoading(false);
    }
  }

  function connectSlack() {
    window.location.href =
      `${API_URL}/api/slack/connect`;
  }

  async function disconnectSlack() {
    const confirmed =
      window.confirm(
        "Disconnect Slack from ReachInbox?"
      );

    if (!confirmed) {
      return;
    }

    try {
      const response =
        await fetch(
          `${API_URL}/api/slack/disconnect`,
          {
            method: "POST",
            credentials: "include"
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to disconnect Slack"
        );
      }

      setSlackConnected(false);
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Failed to disconnect Slack"
      );
    }
  }

  useEffect(() => {
    if (dashboard) {
      loadSlackStatus();
    }
  }, [dashboard]);

  /*
   * ==================================================
   * GOOGLE LOGIN
   * ==================================================
   */

  function loginWithGoogle() {
    window.location.href =
      `${API_URL}/api/auth/google`;
  }

  /*
   * ==================================================
   * LOGOUT
   * ==================================================
   */

  async function logout() {
    try {
      await fetch(
        `${API_URL}/api/auth/logout`,
        {
          method: "POST",
          credentials: "include"
        }
      );

      setDashboard(null);
    } catch (err) {
      console.error(
        "Logout error:",
        err
      );
    }
  }

  /*
   * ==================================================
   * RESET SENDER FORM
   * ==================================================
   */

  function resetSenderForm() {
    setEditingSenderId(null);

    setSenderEmail("");

    setSmtpHost(
      "smtp.ethereal.email"
    );

    setSmtpPort("587");

    setSmtpUser("");

    setSmtpPassword("");

    setSenderMessage("");

    setSenderError("");
  }

  /*
   * ==================================================
   * OPEN ADD SENDER
   * ==================================================
   */

  function openAddSender() {
    resetSenderForm();

    setShowSenderForm(true);
  }

  /*
   * ==================================================
   * OPEN EDIT SENDER
   * ==================================================
   */

  function openEditSender(
    sender: Sender
  ) {
    setEditingSenderId(
      sender.id
    );

    setSenderEmail(
      sender.email
    );

    setSmtpHost(
      sender.smtpHost
    );

    setSmtpPort(
      String(sender.smtpPort)
    );

    /*
     * Never expose the stored password
     * back to the browser.
     */
    setSmtpUser("");

    setSmtpPassword("");

    setSenderMessage("");

    setSenderError("");

    setShowSenderForm(true);
  }

  /*
   * ==================================================
   * ADD SENDER
   * ==================================================
   */

  async function handleAddSender(
    event: FormEvent
  ) {
    event.preventDefault();

    setAddingSender(true);
    setSenderMessage("");
    setSenderError("");

    try {
      const response =
        await fetch(
          `${API_URL}/api/senders`,
          {
            method: "POST",

            credentials:
              "include",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              email:
                senderEmail.trim(),

              smtpHost:
                smtpHost.trim(),

              smtpPort:
                Number(smtpPort),

              smtpUser:
                smtpUser.trim(),

              smtpPassword
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to add sender"
        );
      }

      setSenderMessage(
        "Sender added successfully."
      );

      await loadDashboard();

      setTimeout(() => {
        setShowSenderForm(false);
        resetSenderForm();
      }, 700);
    } catch (err) {
      setSenderError(
        err instanceof Error
          ? err.message
          : "Failed to add sender"
      );
    } finally {
      setAddingSender(false);
    }
  }

  /*
   * ==================================================
   * UPDATE SENDER
   * ==================================================
   */

  async function handleUpdateSender(
    event: FormEvent
  ) {
    event.preventDefault();

    if (!editingSenderId) {
      return;
    }

    setAddingSender(true);
    setSenderMessage("");
    setSenderError("");

    try {
      const response =
        await fetch(
          `${API_URL}/api/senders/${editingSenderId}`,
          {
            method: "PUT",

            credentials:
              "include",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              email:
                senderEmail.trim(),

              smtpHost:
                smtpHost.trim(),

              smtpPort:
                Number(smtpPort),

              smtpUser:
                smtpUser.trim(),

              /*
               * Empty password means:
               * keep existing password.
               */
              smtpPassword
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to update sender"
        );
      }

      setSenderMessage(
        "Sender updated successfully."
      );

      await loadDashboard();

      setTimeout(() => {
        setShowSenderForm(false);
        resetSenderForm();
      }, 700);
    } catch (err) {
      setSenderError(
        err instanceof Error
          ? err.message
          : "Failed to update sender"
      );
    } finally {
      setAddingSender(false);
    }
  }

  /*
   * ==================================================
   * DELETE SENDER
   * ==================================================
   */

  async function deleteSender(
    id: string
  ) {
    const confirmed =
      window.confirm(
        "Delete this sender?"
      );

    if (!confirmed) {
      return;
    }

    try {
      const response =
        await fetch(
          `${API_URL}/api/senders/${id}`,
          {
            method: "DELETE",
            credentials: "include"
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to delete sender"
        );
      }

      await loadDashboard();
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Failed to delete sender"
      );
    }
  }

  /*
   * ==================================================
   * RECIPIENT FILE UPLOAD
   * ==================================================
   */

  async function handleRecipientFile(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text =
        await file.text();

      setRecipientText(
        text
      );

      setScheduleError("");
    } catch {
      setScheduleError(
        "Unable to read the selected file."
      );
    }
  }

  /*
   * ==================================================
   * SCHEDULE EMAIL CAMPAIGN
   * ==================================================
   */

  async function handleSchedule(
    event: FormEvent
  ) {
    event.preventDefault();

    setScheduling(true);

    setScheduleMessage("");

    setScheduleError("");

    try {
      if (!senderId) {
        throw new Error(
          "Please select a sender."
        );
      }

      if (!subject.trim()) {
        throw new Error(
          "Please enter a subject."
        );
      }

      if (!body.trim()) {
        throw new Error(
          "Please enter the email body."
        );
      }

      if (recipientCount === 0) {
        throw new Error(
          "Please add at least one valid email address."
        );
      }

      if (!startTime) {
        throw new Error(
          "Please select a start time."
        );
      }

      const selectedTime =
        new Date(startTime);

      if (
        Number.isNaN(
          selectedTime.getTime()
        )
      ) {
        throw new Error(
          "Invalid start time."
        );
      }

      if (
        selectedTime.getTime() <=
        Date.now()
      ) {
        throw new Error(
          "Start time must be in the future."
        );
      }

      const delay =
        Number(delaySeconds);

      const limit =
        Number(hourlyLimit);

      if (
        !Number.isFinite(delay) ||
        delay < 0
      ) {
        throw new Error(
          "Delay must be 0 or greater."
        );
      }

      if (
        !Number.isFinite(limit) ||
        limit < 1
      ) {
        throw new Error(
          "Hourly limit must be at least 1."
        );
      }

      const delayMs =
        Math.floor(
          delay * 1000
        );

      const response =
        await fetch(
          `${API_URL}/api/compose`,
          {
            method: "POST",

            credentials:
              "include",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              senderId,

              subject:
                subject.trim(),

              body:
                body.trim(),

              recipients:
                extractEmails(
                  recipientText
                ),

              startTime:
                selectedTime.toISOString(),

              delayMs,

              hourlyLimit:
                Math.floor(
                  limit
                )
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to schedule emails"
        );
      }

      setScheduleMessage(
        `${data.count} email(s) scheduled successfully.`
      );

      setSubject("");

      setBody("");

      setRecipientText("");

      await loadDashboard();

      setActiveTab(
        "scheduled"
      );
    } catch (err) {
      setScheduleError(
        err instanceof Error
          ? err.message
          : "Failed to schedule emails"
      );
    } finally {
      setScheduling(false);
    }
  }

  /*
   * ==================================================
   * LOGIN SCREEN
   * ==================================================
   */

  if (!loading && !dashboard) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <div className="mb-8">
            <p className="text-sm font-medium text-blue-400">
              ReachInbox
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Email Scheduler
            </h1>

            <p className="mt-3 text-sm text-slate-400">
              Schedule, manage and monitor
              email campaigns from one place.
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            onClick={
              loginWithGoogle
            }
            className="w-full rounded-xl bg-white px-4 py-3 font-semibold text-slate-900 transition hover:bg-slate-200"
          >
            Continue with Google
          </button>
        </div>
      </main>
    );
  }

  /*
   * ==================================================
   * LOADING SCREEN
   * ==================================================
   */

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />

          <p className="text-slate-400">
            Loading ReachInbox...
          </p>
        </div>
      </main>
    );
  }

  /*
   * ==================================================
   * MAIN DASHBOARD
   * ==================================================
   */

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* HEADER */}

      <header className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">
              ReachInbox
            </h1>

            <p className="text-xs text-slate-500">
              Email Scheduler
            </p>
          </div>

          <div className="flex items-center gap-4">
            {dashboard?.user.avatar && (
              <img
                src={
                  dashboard.user.avatar
                }
                alt={
                  dashboard.user.name
                }
                className="h-9 w-9 rounded-full"
              />
            )}

            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">
                {dashboard?.user.name}
              </p>

              <p className="text-xs text-slate-500">
                {dashboard?.user.email}
              </p>
            </div>

            {!slackLoading && (
              slackConnected ? (
                <button
                  onClick={disconnectSlack}
                  className="rounded-lg border border-green-800 bg-green-950/30 px-3 py-2 text-sm text-green-400 hover:bg-green-950"
                  title="Click to disconnect Slack"
                >
                  ✓ Slack Connected
                </button>
              ) : (
                <button
                  onClick={connectSlack}
                  className="rounded-lg bg-[#4A154B] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  Connect Slack
                </button>
              )
            )}

            <button
              onClick={logout}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* NAVIGATION */}

        <nav className="mb-8 flex flex-wrap gap-2">
          {[
            [
              "dashboard",
              "Dashboard"
            ],
            [
              "compose",
              "Compose"
            ],
            [
              "scheduled",
              "Scheduled"
            ],
            [
              "sent",
              "Sent"
            ],
            [
              "search",
              "Search"
            ]
          ].map(
            ([value, label]) => (
              <button
                key={value}
                onClick={() =>
                  setActiveTab(
                    value as
                      | "dashboard"
                      | "compose"
                      | "scheduled"
                      | "sent"
                  )
                }
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  activeTab ===
                  value
                    ? "bg-blue-600 text-white"
                    : "bg-slate-900 text-slate-400 hover:bg-slate-800"
                }`}
              >
                {label}
              </button>
            )
          )}
        </nav>

        {/* ==================================================
            DASHBOARD
            ================================================== */}

        {activeTab ===
          "dashboard" && (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold">
                Dashboard
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Monitor your email campaigns.
              </p>
            </div>

            {/* STATS */}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <p className="text-sm text-slate-500">
                  Scheduled
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {
                    dashboard?.stats
                      .scheduled
                  }
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <p className="text-sm text-slate-500">
                  Sent
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {
                    dashboard?.stats
                      .sent
                  }
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <p className="text-sm text-slate-500">
                  Senders
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {
                    dashboard?.stats
                      .senders
                  }
                </p>
              </div>
            </div>

            {/* SLACK */}

            <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">
                    Slack Notifications
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Get notified when an email sender reaches its hourly limit.
                  </p>
                </div>

                {slackConnected ? (
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-green-950/40 px-3 py-1.5 text-xs font-medium text-green-400">
                      ✓ Connected
                    </span>

                    <button
                      onClick={disconnectSlack}
                      className="rounded-lg border border-red-900 px-3 py-2 text-xs text-red-400 hover:bg-red-950"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={connectSlack}
                    className="rounded-lg bg-[#4A154B] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Connect Slack
                  </button>
                )}
              </div>
            </div>

            {/* SENDERS */}

            <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">
                    Email Senders
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Configure SMTP accounts used
                    for sending.
                  </p>
                </div>

                <button
                  onClick={
                    openAddSender
                  }
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
                >
                  + Add Sender
                </button>
              </div>

              <div className="mt-6 space-y-3">
                {dashboard?.senders
                  .length ===
                0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
                    <p className="text-slate-400">
                      No senders configured.
                    </p>

                    <button
                      onClick={
                        openAddSender
                      }
                      className="mt-3 text-sm text-blue-400 hover:text-blue-300"
                    >
                      Add your first sender
                    </button>
                  </div>
                ) : (
                  dashboard?.senders.map(
                    (sender) => (
                      <div
                        key={
                          sender.id
                        }
                        className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-4"
                      >
                        <div>
                          <p className="font-medium">
                            {
                              sender.email
                            }
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {
                              sender.smtpHost
                            }
                            :
                            {
                              sender.smtpPort
                            }
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              openEditSender(
                                sender
                              )
                            }
                            className="rounded-lg border border-blue-800 px-3 py-2 text-xs text-blue-400 hover:bg-blue-950"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() =>
                              deleteSender(
                                sender.id
                              )
                            }
                            className="rounded-lg border border-red-900 px-3 py-2 text-xs text-red-400 hover:bg-red-950"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            </div>
          </>
        )}

        {/* ==================================================
            COMPOSE
            ================================================== */}

        {activeTab ===
          "compose" && (
          <div className="max-w-4xl">
            <div className="mb-8">
              <h2 className="text-2xl font-bold">
                Compose Email Campaign
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Create a campaign and schedule
                emails through BullMQ.
              </p>
            </div>

            <form
              onSubmit={
                handleSchedule
              }
              className="space-y-6"
            >
              {/* SENDER */}

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <label className="text-sm font-medium">
                  Sender
                </label>

                <select
                  value={senderId}
                  onChange={(event) =>
                    setSenderId(
                      event.target
                        .value
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">
                    Select sender
                  </option>

                  {dashboard?.senders.map(
                    (sender) => (
                      <option
                        key={
                          sender.id
                        }
                        value={
                          sender.id
                        }
                      >
                        {
                          sender.email
                        }
                      </option>
                    )
                  )}
                </select>

                {dashboard?.senders
                  .length ===
                  0 && (
                  <p className="mt-2 text-sm text-yellow-400">
                    Add an SMTP sender before
                    scheduling emails.
                  </p>
                )}
              </div>

              {/* RECIPIENTS */}

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    Recipients
                  </label>

                  <span className="rounded-full bg-blue-950 px-3 py-1 text-xs text-blue-300">
                    {recipientCount}{" "}
                    recipient
                    {recipientCount !==
                    1
                      ? "s"
                      : ""}
                  </span>
                </div>

                <textarea
                  value={
                    recipientText
                  }
                  onChange={(event) =>
                    setRecipientText(
                      event.target
                        .value
                    )
                  }
                  placeholder={`Paste email addresses here...

example@gmail.com
john@example.com
someone@example.com`}
                  rows={8}
                  className="mt-3 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    You can paste emails separated
                    by commas, lines, or CSV data.
                  </p>

                  <label className="cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">
                    Upload CSV / TXT

                    <input
                      type="file"
                      accept=".csv,.txt"
                      onChange={
                        handleRecipientFile
                      }
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* SUBJECT + BODY */}

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <label className="text-sm font-medium">
                  Subject
                </label>

                <input
                  type="text"
                  value={subject}
                  onChange={(event) =>
                    setSubject(
                      event.target
                        .value
                    )
                  }
                  placeholder="Enter email subject"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />

                <label className="mt-5 block text-sm font-medium">
                  Email Body
                </label>

                <textarea
                  value={body}
                  onChange={(event) =>
                    setBody(
                      event.target
                        .value
                    )
                  }
                  placeholder="Write your email..."
                  rows={10}
                  className="mt-2 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              {/* SCHEDULING SETTINGS */}

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="font-semibold">
                  Scheduling Settings
                </h3>

                <div className="mt-5 grid gap-5 md:grid-cols-3">
                  <div>
                    <label className="text-sm text-slate-300">
                      Start Time
                    </label>

                    <input
                      type="datetime-local"
                      value={
                        startTime
                      }
                      onChange={(
                        event
                      ) =>
                        setStartTime(
                          event
                            .target
                            .value
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-300">
                      Delay Between Emails
                    </label>

                    <div className="mt-2 flex">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={
                          delaySeconds
                        }
                        onChange={(
                          event
                        ) =>
                          setDelaySeconds(
                            event
                              .target
                              .value
                          )
                        }
                        className="w-full rounded-l-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-blue-500"
                      />

                      <span className="flex items-center rounded-r-lg border border-l-0 border-slate-700 bg-slate-900 px-3 text-xs text-slate-500">
                        sec
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-slate-300">
                      Hourly Limit
                    </label>

                    <input
                      type="number"
                      min="1"
                      value={
                        hourlyLimit
                      }
                      onChange={(
                        event
                      ) =>
                        setHourlyLimit(
                          event
                            .target
                            .value
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* MESSAGES */}

              {scheduleMessage && (
                <div className="rounded-xl border border-green-800 bg-green-950/30 p-4 text-sm text-green-300">
                  {scheduleMessage}
                </div>
              )}

              {scheduleError && (
                <div className="rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">
                  {scheduleError}
                </div>
              )}

              {/* SUBMIT */}

              <button
                type="submit"
                disabled={
                  scheduling ||
                  dashboard?.senders
                    .length ===
                    0
                }
                className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {scheduling
                  ? "Scheduling..."
                  : `Schedule ${recipientCount || ""} Email${
                      recipientCount ===
                      1
                        ? ""
                        : "s"
                    }`}
              </button>
            </form>
          </div>
        )}

        {/* ==================================================
            SCHEDULED
            ================================================== */}

        {activeTab ===
          "scheduled" && (
          <div>
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  Scheduled Emails
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Emails waiting to be processed by BullMQ.
                </p>
              </div>

              <button
                onClick={() =>
                  loadEmails("scheduled")
                }
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Refresh
              </button>
            </div>

            {emailsLoading ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
                <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
                <p className="text-sm text-slate-400">
                  Loading scheduled emails...
                </p>
              </div>
            ) : emailsError ? (
              <div className="rounded-2xl border border-red-800 bg-red-950/30 p-6">
                <p className="text-sm text-red-300">
                  {emailsError}
                </p>
                <button
                  onClick={() =>
                    loadEmails("scheduled")
                  }
                  className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold hover:bg-red-600"
                >
                  Try Again
                </button>
              </div>
            ) : emails.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900 p-10 text-center">
                <p className="text-lg font-medium">
                  No scheduled emails
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Emails scheduled for future delivery will appear here.
                </p>
                <button
                  onClick={() =>
                    setActiveTab("compose")
                  }
                  className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
                >
                  Compose Email
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-800 bg-slate-950">
                      <tr>
                        <th className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                          Recipient
                        </th>
                        <th className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                          Subject
                        </th>
                        <th className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                          Sender
                        </th>
                        <th className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                          Scheduled
                        </th>
                        <th className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {emails.map((email) => (
                        <tr
                          key={email.id}
                          className="hover:bg-slate-950/60"
                        >
                          <td className="px-5 py-4 font-medium">
                            {email.recipient}
                          </td>
                          <td className="max-w-xs truncate px-5 py-4 text-slate-300">
                            {email.subject}
                          </td>
                          <td className="px-5 py-4 text-slate-400">
                            {email.sender?.email || "-"}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-slate-400">
                            {new Date(
                              email.scheduledAt
                            ).toLocaleString()}
                          </td>
                          <td className="px-5 py-4">
                            <span className="rounded-full bg-yellow-950/40 px-3 py-1 text-xs font-medium text-yellow-400">
                              {email.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================================================
            SENT
            ================================================== */}

        {activeTab ===
          "sent" && (
          <div>
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  Sent Emails
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Emails successfully delivered through your SMTP sender.
                </p>
              </div>

              <button
                onClick={() =>
                  loadEmails("sent")
                }
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Refresh
              </button>
            </div>

            {emailsLoading ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
                <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
                <p className="text-sm text-slate-400">
                  Loading sent emails...
                </p>
              </div>
            ) : emailsError ? (
              <div className="rounded-2xl border border-red-800 bg-red-950/30 p-6">
                <p className="text-sm text-red-300">
                  {emailsError}
                </p>
                <button
                  onClick={() =>
                    loadEmails("sent")
                  }
                  className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold hover:bg-red-600"
                >
                  Try Again
                </button>
              </div>
            ) : emails.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900 p-10 text-center">
                <p className="text-lg font-medium">
                  No sent emails yet
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Successfully sent emails will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-800 bg-slate-950">
                      <tr>
                        <th className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                          Recipient
                        </th>
                        <th className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                          Subject
                        </th>
                        <th className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                          Sender
                        </th>
                        <th className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                          Sent At
                        </th>
                        <th className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {emails.map((email) => (
                        <tr
                          key={email.id}
                          className="hover:bg-slate-950/60"
                        >
                          <td className="px-5 py-4 font-medium">
                            {email.recipient}
                          </td>
                          <td className="max-w-xs truncate px-5 py-4 text-slate-300">
                            {email.subject}
                          </td>
                          <td className="px-5 py-4 text-slate-400">
                            {email.sender?.email || "-"}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-slate-400">
                            {email.sentAt
                              ? new Date(
                                  email.sentAt
                                ).toLocaleString()
                              : "-"}
                          </td>
                          <td className="px-5 py-4">
                            <span className="rounded-full bg-green-950/40 px-3 py-1 text-xs font-medium text-green-400">
                              Sent
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}


        {/* ==================================================
            SEARCH
            ================================================== */}

        {activeTab ===
          "search" && (
          <div>
            <div className="mb-8">
              <h2 className="text-2xl font-bold">
                Search Emails
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Search indexed emails using Elasticsearch.
              </p>
            </div>

            <form
              onSubmit={handleSearch}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(
                      event.target.value
                    )
                  }
                  placeholder="Search recipient, subject, body or sender..."
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />

                <button
                  type="submit"
                  disabled={searchLoading}
                  className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
                >
                  {searchLoading
                    ? "Searching..."
                    : "Search"}
                </button>
              </div>

              {searchError && (
                <div className="mt-4 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
                  {searchError}
                </div>
              )}
            </form>

            {!searchLoading &&
              searchQuery.trim() &&
              searchResults.length === 0 &&
              !searchError && (
                <div className="mt-6 rounded-2xl border border-dashed border-slate-700 bg-slate-900 p-10 text-center">
                  <p className="font-medium">
                    No emails found
                  </p>

                  <p className="mt-2 text-sm text-slate-500">
                    Try another recipient, subject or keyword.
                  </p>
                </div>
              )}

            {searchResults.length > 0 && (
              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-800 bg-slate-950">
                      <tr>
                        <th className="px-5 py-4 text-xs uppercase tracking-wide text-slate-500">
                          Recipient
                        </th>
                        <th className="px-5 py-4 text-xs uppercase tracking-wide text-slate-500">
                          Subject
                        </th>
                        <th className="px-5 py-4 text-xs uppercase tracking-wide text-slate-500">
                          Sender
                        </th>
                        <th className="px-5 py-4 text-xs uppercase tracking-wide text-slate-500">
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-800">
                      {searchResults.map(
                        (result) => {
                          const source =
                            result._source ||
                            {};

                          return (
                            <tr
                              key={
                                result._id
                              }
                              className="hover:bg-slate-950/60"
                            >
                              <td className="px-5 py-4 font-medium">
                                {source.recipient ||
                                  "-"}
                              </td>
                              <td className="px-5 py-4 text-slate-300">
                                {source.subject ||
                                  "-"}
                              </td>
                              <td className="px-5 py-4 text-slate-400">
                                {source.senderEmail ||
                                  "-"}
                              </td>
                              <td className="px-5 py-4">
                                <span className="rounded-full bg-blue-950/40 px-3 py-1 text-xs text-blue-400">
                                  {source.status ||
                                    "-"}
                                </span>
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ==================================================
          ADD / EDIT SENDER MODAL
          ================================================== */}

      {showSenderForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  {editingSenderId
                    ? "Edit Email Sender"
                    : "Add Email Sender"}
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  {editingSenderId
                    ? "Update the SMTP configuration for this sender."
                    : "Configure the SMTP account used to send emails."}
                </p>
              </div>

              <button
                onClick={() => {
                  setShowSenderForm(
                    false
                  );

                  resetSenderForm();
                }}
                className="text-xl text-slate-500 hover:text-white"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={
                editingSenderId
                  ? handleUpdateSender
                  : handleAddSender
              }
              className="mt-6 space-y-4"
            >
              {/* SENDER EMAIL */}

              <div>
                <label className="text-sm">
                  Sender Email
                </label>

                <input
                  type="email"
                  value={
                    senderEmail
                  }
                  onChange={(event) =>
                    setSenderEmail(
                      event.target
                        .value
                    )
                  }
                  placeholder="sender@example.com"
                  required
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              {/* SMTP HOST */}

              <div>
                <label className="text-sm">
                  SMTP Host
                </label>

                <input
                  type="text"
                  value={
                    smtpHost
                  }
                  onChange={(event) =>
                    setSmtpHost(
                      event.target
                        .value
                    )
                  }
                  required
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              {/* SMTP PORT */}

              <div>
                <label className="text-sm">
                  SMTP Port
                </label>

                <input
                  type="number"
                  value={
                    smtpPort
                  }
                  onChange={(event) =>
                    setSmtpPort(
                      event.target
                        .value
                    )
                  }
                  required
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              {/* SMTP USERNAME */}

              <div>
                <label className="text-sm">
                  SMTP Username
                </label>

                <input
                  type="text"
                  value={
                    smtpUser
                  }
                  onChange={(event) =>
                    setSmtpUser(
                      event.target
                        .value
                    )
                  }
                  required
                  placeholder={
                    editingSenderId
                      ? "Enter username"
                      : "Enter SMTP username"
                  }
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              {/* SMTP PASSWORD */}

              <div>
                <label className="text-sm">
                  SMTP Password
                </label>

                <input
                  type="password"
                  value={
                    smtpPassword
                  }
                  onChange={(event) =>
                    setSmtpPassword(
                      event.target
                        .value
                    )
                  }
                  required={
                    !editingSenderId
                  }
                  placeholder={
                    editingSenderId
                      ? "Leave blank to keep existing password"
                      : "Enter SMTP password"
                  }
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              {senderMessage && (
                <div className="rounded-lg border border-green-800 bg-green-950/30 p-3 text-sm text-green-300">
                  {senderMessage}
                </div>
              )}

              {senderError && (
                <div className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
                  {senderError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSenderForm(
                      false
                    );

                    resetSenderForm();
                  }}
                  className="flex-1 rounded-lg border border-slate-700 px-4 py-3 text-sm font-medium hover:bg-slate-800"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    addingSender
                  }
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
                >
                  {addingSender
                    ? editingSenderId
                      ? "Updating..."
                      : "Adding..."
                    : editingSenderId
                      ? "Update Sender"
                      : "Add Sender"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}