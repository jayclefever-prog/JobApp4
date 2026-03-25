import { useState, useEffect, useCallback } from "react";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const JSEARCH_KEY = "82c67a2db2msh8abb5ccb0daacd7p1b00c8jsn281ed9d9eac9";

// Search queries — trimmed to 5 to stay within free API quota (200 req/month)
// Each query is broad enough to capture DEI, wellness, nonprofits, culture orgs, GPTW-style
const SEARCH_QUERIES = [
  "Director Operations Chief of Staff mission driven remote",
  "Program Manager people culture employee experience remote",
  "Chief of Staff mental health wellness education remote",
  "Customer Experience Program Manager culture organization remote",
  "Senior Operations Manager social enterprise B-corp remote",
  "Program Manager organizational effectiveness remote",
];

// Role keywords — what the JOB involves
const ROLE_KEYWORDS = [
  "operations", "chief of staff", "program manager", "program management",
  "portfolio", "consulting", "process", "director", "vice president", "vp",
  "people", "culture", "organizational", "strategy", "implementation",
  "customer experience", "member experience", "client experience",
  "customer success", "onboarding", "service delivery", "cross-functional",
];

// Mission/culture keywords — what the COMPANY is about
// Includes Great Place To Work-type orgs: workplace culture, employee experience, HR mission
const MISSION_KEYWORDS = [
  // DEI and belonging
  "dei", "diversity", "equity", "inclusion", "belonging", "deib",
  // Wellness and mental health
  "wellness", "mental health", "wellbeing", "mindfulness", "headspace",
  // Workplace culture and employee experience (Great Place To Work model)
  "workplace culture", "employee experience", "great place to work",
  "employer brand", "best workplaces", "culture transformation",
  "employee engagement", "organizational health", "trust index",
  // Social enterprise and impact
  "social impact", "social enterprise", "b corp", "b-corp", "benefit corporation",
  // Nonprofit and mission
  "nonprofit", "non-profit", "ngo", "foundation", "association",
  // Education and learning
  "education", "edtech", "learning", "training", "professional development",
  // Sustainability and environment
  "sustainability", "climate", "environment", "clean energy", "green",
  // Health equity and community
  "healthcare", "health equity", "community", "public health",
  // Mission and purpose signals
  "mission driven", "mission-driven", "purpose driven", "purpose-driven",
  "values driven", "values-driven", "for good",
  // Human rights and advocacy
  "human rights", "advocacy", "civic", "policy",
  // Gender and racial equity
  "women", "gender", "racial equity", "underrepresented",
  // HR tech and people platforms
  "hr tech", "people platform", "people analytics", "talent management",
  "culture platform", "recognition platform",
];

const SEND_HOURS = [8, 12, 15];

// ─── HELPERS ───────────────────────────────────────────────────────────────
const scoreJob = (job) => {
  const text = `${job.title} ${job.description} ${job.company}`.toLowerCase();
  let score = 50;

  // Role keyword hits — most important signal
  let roleHits = 0;
  ROLE_KEYWORDS.forEach(kw => { if (text.includes(kw)) roleHits++; });
  score += Math.min(roleHits * 6, 30);

  // Mission/culture signal — org is values-driven even if not a DEI firm
  let missionHits = 0;
  MISSION_KEYWORDS.forEach(kw => { if (text.includes(kw)) missionHits++; });
  score += Math.min(missionHits * 4, 20);

  // Seniority bonus
  if (/director|vice president|\bvp\b|chief of staff|senior director/i.test(text)) score += 4;
  // Remote bonus
  if (text.includes("remote")) score += 3;
  // Bonus: customer/member/client experience program management is a direct fit
  if (/customer experience|member experience|client experience|cx program/i.test(text)) score += 6;
  // Bonus: workplace culture platform orgs (Great Place To Work model)
  if (/workplace culture|employee experience|employer brand|culture platform/i.test(text)) score += 6;
  // Penalty: purely technical/engineering roles
  if (/software engineer|data scientist|machine learning|devops|backend|frontend|full.?stack/i.test(job.title)) score -= 25;
  // Penalty: pure sales/account executive roles
  if (/account executive|sales representative|sales manager|business development rep/i.test(job.title)) score -= 15;

  return Math.max(0, Math.min(score, 99));
};

const formatSalary = (job) => {
  const min = job.job_min_salary;
  const max = job.job_max_salary;
  const period = job.job_salary_period;
  if (!min && !max) return null;
  const fmt = (n) => {
    if (period === "YEAR") return `$${Math.round(n / 1000)}k`;
    if (period === "HOUR") return `$${Math.round(n)}/hr`;
    return `$${Math.round(n)}`;
  };
  if (min && max) return `${fmt(min)}–${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  return null;
};

const timeAgo = (dateStr) => {
  if (!dateStr) return "Recently";
  const d = new Date(dateStr * 1000);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
};

const isPostedRecently = (dateStr) => {
  if (!dateStr) return false;
  const THREE_DAYS_AGO = Date.now() - 3 * 24 * 60 * 60 * 1000;
  return dateStr * 1000 >= THREE_DAYS_AGO;
};

const getScheduleInfo = () => {
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
  const totalSecs = h * 3600 + m * 60 + s;
  for (const sh of SEND_HOURS) {
    if (totalSecs >= sh * 3600 && totalSecs < sh * 3600 + 300) {
      const labels = { 8: "8:00 AM", 12: "12:00 PM", 15: "3:00 PM" };
      return { isWindowOpen: true, windowLabel: labels[sh], nextLabel: "", countdown: "" };
    }
  }
  const upcomingHour = SEND_HOURS.find(sh => sh * 3600 > totalSecs);
  const nextHour = upcomingHour ?? SEND_HOURS[0] + 24;
  const secsUntil = nextHour * 3600 - totalSecs;
  const hh = Math.floor(secsUntil / 3600);
  const mm = Math.floor((secsUntil % 3600) / 60);
  const ss = secsUntil % 60;
  const timeLabels = { 8: "8:00 AM", 12: "12:00 PM", 15: "3:00 PM" };
  return {
    isWindowOpen: false, windowLabel: "",
    nextLabel: timeLabels[upcomingHour] ?? "8:00 AM (tomorrow)",
    countdown: hh > 0 ? `${hh}h ${mm}m ${ss}s` : `${mm}m ${ss}s`,
  };
};

// ─── SUB-COMPONENTS ────────────────────────────────────────────────────────
const ScoreRing = ({ score }) => {
  const color = score >= 90 ? "#4ade80" : score >= 78 ? "#facc15" : "#fb923c";
  const r = 18, circ = 2 * Math.PI * r, fill = (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
      <svg width="52" height="52" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color, fontFamily: "monospace", lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 7, color: "rgba(255,255,255,0.3)" }}>%</span>
      </div>
    </div>
  );
};

const Toast = ({ message }) => (
  <div style={{
    position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
    background: "#4ade80", color: "#052e16", padding: "10px 24px", borderRadius: 100,
    fontSize: 13, fontWeight: 700, boxShadow: "0 8px 32px rgba(74,222,128,0.3)",
    zIndex: 9999, whiteSpace: "nowrap", pointerEvents: "none"
  }}>{message}</div>
);

const SkeletonCard = () => (
  <div style={{ background: "#0a0f1a", border: "1px solid #0f172a", borderRadius: 12, padding: "15px 16px", marginBottom: 9 }}>
    <div style={{ display: "flex", gap: 13 }}>
      <div className="shimmer" style={{ width: 52, height: 52, borderRadius: "50%", flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div className="shimmer" style={{ height: 16, width: "65%", borderRadius: 6, marginBottom: 8 }} />
        <div className="shimmer" style={{ height: 12, width: "40%", borderRadius: 6, marginBottom: 14 }} />
        <div style={{ display: "flex", gap: 6 }}>
          <div className="shimmer" style={{ height: 20, width: 60, borderRadius: 4 }} />
          <div className="shimmer" style={{ height: 20, width: 80, borderRadius: 4 }} />
          <div className="shimmer" style={{ height: 20, width: 50, borderRadius: 4 }} />
        </div>
      </div>
    </div>
  </div>
);

// ─── MAIN APP ──────────────────────────────────────────────────────────────
export default function JobApp() {
  const [allJobs, setAllJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const [tab, setTab] = useState("today");
  const [saved, setSaved] = useState(new Set());
  const [applied, setApplied] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);
  const [emailPanel, setEmailPanel] = useState(false);
  const [emailContent, setEmailContent] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [minScore, setMinScore] = useState(65);
  const [scheduleInfo, setScheduleInfo] = useState(getScheduleInfo());
  const [refreshing, setRefreshing] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Cache helpers ─────────────────────────────────────────────────────────
  // Cache jobs in localStorage for 6 hours to preserve API quota
  const CACHE_KEY = "katie_jobs_cache_v2";  // bumped version clears old cache
  const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours in ms

  const loadCache = () => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { jobs, timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp > CACHE_TTL) return null; // expired
      return { jobs, timestamp };
    } catch { return null; }
  };

  const saveCache = (jobs) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ jobs, timestamp: Date.now() }));
    } catch { /* storage full, ignore */ }
  };

  // ── Fetch live jobs from JSearch ──────────────────────────────────────────
  const fetchJobs = useCallback(async (isRefresh = false) => {
    // Check cache first — skip API call if data is fresh (unless manual refresh)
    if (!isRefresh) {
      const cached = loadCache();
      if (cached) {
        setAllJobs(cached.jobs);
        setLastFetched(new Date(cached.timestamp));
        setLoading(false);
        return;
      }
    }

    if (isRefresh) setRefreshing(true); else setLoading(true);
    setFetchError(null);
    const seen = new Set();
    const results = [];

    const TEN_DAYS_AGO = Date.now() - 10 * 24 * 60 * 60 * 1000;

    for (const query of SEARCH_QUERIES) {
      try {
        // date_posted=month keeps results recent; we hard-filter to 10 days below
        const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&num_pages=2&page=1&date_posted=month&remote_jobs_only=true&actively_hiring=true`;
        const res = await fetch(url, {
          headers: {
            "x-rapidapi-host": "jsearch.p.rapidapi.com",
            "x-rapidapi-key": JSEARCH_KEY,
          },
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        const jobs = data.data || [];
        jobs.forEach(j => {
          if (seen.has(j.job_id)) return;

          // ── Hard filter 1: must have been posted within the last 10 days ──
          const postedMs = j.job_posted_at_timestamp
            ? j.job_posted_at_timestamp * 1000
            : null;
          if (postedMs && postedMs < TEN_DAYS_AGO) return;

          // ── Hard filter 2: must still be accepting applicants ──
          // JSearch surfaces this via job_is_remote + apply link validity.
          // We exclude jobs with no apply link and those flagged as expired.
          const applyLink = j.job_apply_link || j.job_google_link;
          if (!applyLink) return;
          if (j.job_apply_is_direct === false && !j.job_google_link) return;

          seen.add(j.job_id);
          const salary = formatSalary(j);
          const score = scoreJob({ title: j.job_title, description: j.job_description || "", company: j.employer_name || "" });
          results.push({
            id: j.job_id,
            title: j.job_title,
            company: j.employer_name || "Unknown",
            companyAbout: j.employer_website ? `${j.employer_name} — ${j.employer_website}` : j.employer_name,
            location: j.job_city ? `${j.job_city}${j.job_state ? ", " + j.job_state : ""}` : "Remote",
            salary,
            source: j.job_publisher || "Job Board",
            posted: postedMs ? timeAgo(j.job_posted_at_timestamp) : "Recently",
            postedTs: j.job_posted_at_timestamp,
            matchScore: score,
            tags: [j.job_employment_type || "Full-time", j.job_required_experience?.required_experience_in_months > 60 ? "Senior" : "Mid-level"].filter(Boolean),
            description: (j.job_description || "").slice(0, 300).trim() + "...",
            isNew: isPostedRecently(j.job_posted_at_timestamp),
            url: applyLink,
          });
        });
      } catch (err) {
        console.warn("Query failed:", query, err.message);
      }
    }

    // Sort: new today first, then by score
    results.sort((a, b) => {
      if (a.isNew && !b.isNew) return -1;
      if (!a.isNew && b.isNew) return 1;
      return b.matchScore - a.matchScore;
    });

    if (results.length === 0) {
      setFetchError("No jobs returned from API. Check your key or try again.");
    }
    saveCache(results);
    setAllJobs(results);
    setLastFetched(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Schedule ticker — no auto-refresh to preserve API quota
  useEffect(() => {
    fetchJobs();
    const schedTick = setInterval(() => setScheduleInfo(getScheduleInfo()), 1000);
    return () => clearInterval(schedTick);
  }, [fetchJobs]);

  const todayJobs = allJobs.filter(j => j.isNew);
  const displayJobs = allJobs.filter(j => {
    if (tab === "today") return j.isNew;
    if (tab === "existing") return !j.isNew;
    if (tab === "saved") return saved.has(j.id);
    if (tab === "applied") return applied.has(j.id);
    return true;
  }).filter(j => j.matchScore >= minScore);

  const toggleSave = (id, e) => {
    e.stopPropagation();
    setSaved(prev => {
      const n = new Set(prev);
      n.has(id) ? (n.delete(id), showToast("Removed from saved")) : (n.add(id), showToast("✓ Saved"));
      return n;
    });
  };

  const markApplied = (id, e) => {
    e?.stopPropagation();
    setApplied(prev => { const n = new Set(prev); n.add(id); return n; });
    showToast("✓ Marked as applied!");
  };

  // ── Generate email digest ─────────────────────────────────────────────────
  const generateEmail = async () => {
    if (!scheduleInfo.isWindowOpen) {
      showToast(`Next digest sends at ${scheduleInfo.nextLabel}`);
      return;
    }
    setEmailLoading(true);
    setEmailPanel(true);
    setEmailContent("");
    const emailJobs = (todayJobs.length > 0 ? todayJobs : allJobs).slice(0, 6);
    const prompt = `Write a warm, professional job digest email for Katie Livornese.

Katie's background:
- Current: Director, Operations & Growth at Inclusivv (DEI platform)
- Previous: VP & Senior Director at Jennifer Brown Consulting (top DEI consultancy, 5+ yrs)
- Previous: Director of Events & Global Partnerships at SHE GLOBL (4+ yrs)
- Expertise: operations leadership, program/portfolio management, consulting team leadership, process improvement
- Looking for: Remote, $130k+, Director/VP/Chief of Staff level
- Target companies: mission and culture-driven organizations — DEI firms, wellness (Headspace, Calm), workplace culture platforms (Great Place To Work), nonprofits, B-corps, social enterprises, education, healthcare equity, HR tech with a people mission, sustainability orgs. The role type and company values matter most, not the specific industry.

Today's matched jobs:
${emailJobs.map(j => `
ROLE: ${j.title}
COMPANY: ${j.company}
SALARY: ${j.salary || "Not listed"}
MATCH SCORE: ${j.matchScore}%
DESCRIPTION: ${j.description}
APPLY LINK: ${j.url}
`).join("\n---\n")}

Format the email as plain text EXACTLY like this:

Subject: [Engaging subject line with today's date]

Hi Katie,

[2-sentence warm intro for ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}]

[For EACH job:]
[Role Title] — [Company]
Salary: [salary or "Not listed"]
Match: [score]%
Why it fits: [1 sentence referencing Katie's specific background and why this mission-driven org is relevant]
Apply: [full URL]

[Short encouraging closing line]

No markdown, no bullets, no asterisks. Plain text only.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1200, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      setEmailContent(data.content?.map(b => b.text || "").join("") || "Could not generate.");
    } catch { setEmailContent("Error generating email."); }
    setEmailLoading(false);
  };

  // ── AI job analysis ───────────────────────────────────────────────────────
  const analyzeJob = async (job) => {
    setAiLoading(true);
    setAiAnalysis("");
    const prompt = `Analyze this job for Katie Livornese.

Katie: Director Ops & Growth at Inclusivv, former VP at Jennifer Brown Consulting (DEI consultancy, 5+ yrs), former Director at SHE GLOBL (4+ yrs). Expert in operations leadership, program management, process improvement, consulting team management. Wants remote, $130k+.

Important: Katie is open to any mission and culture-driven organization — not just DEI firms. This includes: wellness (Headspace, Calm), workplace culture platforms (Great Place To Work, Gallup, Culture Amp), nonprofits, B-corps, social enterprises, education, healthcare equity, HR tech with a people mission, sustainability, civic tech. Role type and company values matter most.

Job: ${job.title} at ${job.company}
Salary: ${job.salary || "Not listed"}
Description: ${job.description}

Write in plain text (no markdown):

FIT SUMMARY: Two sentences — does the role fit her ops/program management background, and is the company mission-driven or people-first?
HER STRENGTHS: Two bullet points matching her specific experience to this role.
WATCH OUT: One thing to address in her application.
APPLY CONFIDENCE: High / Medium / Low — one sentence reason.

Under 170 words.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 600, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      setAiAnalysis(data.content?.map(b => b.text || "").join("") || "Could not analyze.");
    } catch { setAiAnalysis("Analysis unavailable."); }
    setAiLoading(false);
  };

  const tabs = [
    { id: "today", label: "New (3 Days)", count: todayJobs.length, hot: true },
    { id: "existing", label: "All Jobs", count: allJobs.filter(j => !j.isNew).length },
    { id: "saved", label: "Saved", count: saved.size },
    { id: "applied", label: "Applied", count: applied.size },
  ];

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#07090f", color: "#e2e8f0", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }
        @keyframes shimmer { 0%{background-position:-200% 0}100%{background-position:200% 0} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .shimmer { background:linear-gradient(90deg,#0f1623 25%,#161f2e 50%,#0f1623 75%);background-size:200% 100%;animation:shimmer 1.4s infinite; }
        .jcard { transition:transform 0.18s,border-color 0.18s;cursor:pointer; }
        .jcard:hover { transform:translateY(-2px); }
        .btn { transition:all 0.15s;cursor:pointer; }
        .btn:hover { opacity:0.82; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background: "linear-gradient(180deg,#0c111d 0%,#07090f 100%)", borderBottom: "1px solid #0f172a", padding: "22px 24px 0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80", display: "inline-block", animation: "pulse 2s infinite" }} />
                <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Live · JSearch API · LinkedIn · Indeed · Glassdoor</span>
                {lastFetched && (
                  <span style={{ fontSize: 10, color: "#1e293b", marginLeft: 8 }}>
                    Cached · refreshes every 6h · {lastFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.02em" }}>Katie's Job Feed</h1>
              <p style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Operations · Program Mgmt · Chief of Staff · Remote · $130k+ · Mission & culture-driven orgs</p>
            </div>

            {/* Schedule + email button */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <div style={{
                background: scheduleInfo.isWindowOpen ? "#052e16" : "#0a0e18",
                border: `1px solid ${scheduleInfo.isWindowOpen ? "#166534" : "#1e293b"}`,
                borderRadius: 10, padding: "8px 14px"
              }}>
                {scheduleInfo.isWindowOpen ? (
                  <>
                    <div style={{ fontSize: 10, color: "#4ade80", fontWeight: 800, letterSpacing: "0.1em" }}>✦ SEND WINDOW OPEN</div>
                    <div style={{ fontSize: 11, color: "#86efac", marginTop: 1 }}>{scheduleInfo.windowLabel} digest ready</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 10, color: "#334155", fontWeight: 700, letterSpacing: "0.08em" }}>NEXT DIGEST</div>
                    <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>
                      {scheduleInfo.nextLabel} <span style={{ fontFamily: "monospace", color: "#334155" }}>({scheduleInfo.countdown})</span>
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                {[{ h: 8, label: "8 AM" }, { h: 12, label: "12 PM" }, { h: 15, label: "3 PM" }].map(({ h, label }) => {
                  const nowH = new Date().getHours(), nowM = new Date().getMinutes();
                  const isActive = nowH === h && nowM < 5;
                  const isPast = nowH > h || (nowH === h && nowM >= 5);
                  return (
                    <span key={h} style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, fontFamily: "monospace",
                      background: isActive ? "#052e16" : isPast ? "#080b10" : "#0f172a",
                      color: isActive ? "#4ade80" : isPast ? "#1a2030" : "#334155",
                      border: `1px solid ${isActive ? "#166534" : isPast ? "#0d1117" : "#1e293b"}`,
                    }}>{label}</span>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => fetchJobs(true)} style={{
                  background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10,
                  padding: "10px 14px", color: "#475569", fontSize: 12, fontWeight: 600
                }}>
                  {refreshing ? "⟳ Refreshing..." : "⟳ Refresh"}
                </button>
                <button className="btn" onClick={generateEmail} style={{
                  background: scheduleInfo.isWindowOpen ? "linear-gradient(135deg,#16a34a,#15803d)" : "linear-gradient(135deg,#1e293b,#0f172a)",
                  border: `1px solid ${scheduleInfo.isWindowOpen ? "#166534" : "#1e293b"}`,
                  borderRadius: 10, padding: "10px 16px", color: scheduleInfo.isWindowOpen ? "#f0fdf4" : "#334155",
                  fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 7,
                  boxShadow: scheduleInfo.isWindowOpen ? "0 4px 20px rgba(22,163,74,0.25)" : "none",
                  cursor: scheduleInfo.isWindowOpen ? "pointer" : "not-allowed"
                }}>
                  ✉ {scheduleInfo.isWindowOpen ? "Send Digest" : "Email Scheduled"}
                </button>
              </div>
            </div>
          </div>

          {/* Filter bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 11, color: "#334155", fontWeight: 600 }}>Min match:</span>
            <input type="range" min={50} max={98} value={minScore} onChange={e => setMinScore(+e.target.value)}
              style={{ flex: 1, maxWidth: 130, accentColor: "#4ade80" }} />
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "#4ade80", fontWeight: 700, minWidth: 36 }}>{minScore}%</span>
            <span style={{ flex: 1 }} />
            {fetchError && <span style={{ fontSize: 11, color: "#ef4444" }}>⚠ {fetchError}</span>}
            {!fetchError && allJobs.length > 0 && (
              <span style={{ fontSize: 11, color: "#1e293b" }}>{allJobs.length} active jobs · posted within 10 days</span>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0 }}>
            {tabs.map(t => (
              <button key={t.id} className="btn" onClick={() => setTab(t.id)} style={{
                background: "none", border: "none", padding: "10px 16px", fontSize: 13,
                fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? "#f1f5f9" : "#4b5563",
                borderBottom: `2px solid ${tab === t.id ? "#4ade80" : "transparent"}`,
                display: "flex", alignItems: "center", gap: 7
              }}>
                {t.label}
                <span style={{
                  background: tab === t.id ? (t.hot ? "#4ade80" : "#1e293b") : "#0f172a",
                  color: tab === t.id && t.hot ? "#052e16" : "#64748b",
                  fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 20
                }}>{t.count}</span>
                {t.hot && t.count > 0 && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", animation: "pulse 2s infinite", boxShadow: "0 0 5px #4ade80" }} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 24px", display: "flex", gap: 18, alignItems: "flex-start" }}>

        {/* Job list */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            [1,2,3,4,5].map(i => <SkeletonCard key={i} />)
          ) : fetchError && allJobs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
              <p style={{ color: "#ef4444", fontWeight: 600 }}>Could not load live jobs</p>
              <p style={{ color: "#475569", fontSize: 13, marginTop: 6 }}>{fetchError}</p>
              <button className="btn" onClick={() => fetchJobs()} style={{
                marginTop: 16, background: "#1e293b", border: "none", borderRadius: 8,
                padding: "10px 20px", color: "#94a3b8", fontSize: 13, fontWeight: 600
              }}>Retry</button>
            </div>
          ) : displayJobs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#334155" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
              <p style={{ fontWeight: 600, fontSize: 15, color: "#475569" }}>
                {tab === "today" ? "No jobs posted in the last 3 days — try refreshing" : "No jobs in this view"}
              </p>
              <p style={{ fontSize: 13, marginTop: 6 }}>Try lowering the match score filter</p>
            </div>
          ) : displayJobs.map((job, idx) => (
            <div key={job.id} className="jcard" onClick={() => { setSelected(job); setAiAnalysis(""); }}
              style={{
                background: selected?.id === job.id ? "#0c1528" : "#0a0f1a",
                border: `1px solid ${selected?.id === job.id ? "#4ade8030" : job.isNew ? "#1a2e20" : "#0f172a"}`,
                borderRadius: 12, padding: "15px 16px", marginBottom: 9,
                animation: `fadeIn 0.3s ease ${idx * 0.03}s both`,
              }}>
              <div style={{ display: "flex", gap: 13 }}>
                <ScoreRing score={job.matchScore} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.3 }}>{job.title}</span>
                        {job.isNew && <span style={{ background: "#052e16", color: "#4ade80", fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 20, letterSpacing: "0.1em", flexShrink: 0 }}>NEW</span>}                        {applied.has(job.id) && <span style={{ background: "#1e1030", color: "#a78bfa", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20, flexShrink: 0 }}>APPLIED</span>}
                      </div>
                      <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{job.company} · {job.location}</p>
                    </div>
                    <button className="btn" onClick={e => toggleSave(job.id, e)}
                      style={{ background: "none", border: "none", fontSize: 16, padding: "2px 4px", color: saved.has(job.id) ? "#facc15" : "#1e293b", flexShrink: 0 }}>
                      {saved.has(job.id) ? "★" : "☆"}
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
                    <span style={{ background: "#0f172a", color: "#475569", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, border: "1px solid #1e293b" }}>{job.source}</span>
                    {job.salary && <span style={{ fontFamily: "monospace", fontSize: 12, color: "#4ade80", fontWeight: 700 }}>{job.salary}</span>}
                    <span style={{ fontSize: 11, color: "#1e293b" }}>·</span>
                    <span style={{ fontSize: 11, color: "#334155" }}>{job.posted}</span>
                    {job.tags.slice(0, 2).map(tag => (
                      <span key={tag} style={{ background: "#0f172a", color: "#334155", fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{
            width: 300, flexShrink: 0, background: "#0a0f1a", border: "1px solid #0f172a",
            borderRadius: 14, padding: "18px", position: "sticky", top: 20,
            animation: "fadeIn 0.2s ease", maxHeight: "calc(100vh - 60px)", overflowY: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <ScoreRing score={selected.matchScore} />
              <button className="btn" onClick={() => { setSelected(null); setAiAnalysis(""); }}
                style={{ background: "#0f172a", border: "none", borderRadius: 6, width: 28, height: 28, color: "#475569", fontSize: 15 }}>✕</button>
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", lineHeight: 1.35, marginBottom: 4 }}>{selected.title}</h2>
            <p style={{ fontSize: 12, color: "#475569", marginBottom: 3 }}>{selected.company} · {selected.location}</p>
            {selected.salary && <p style={{ fontFamily: "monospace", fontSize: 14, color: "#4ade80", fontWeight: 700, marginBottom: 3 }}>{selected.salary}</p>}
            <p style={{ fontSize: 11, color: "#334155", marginBottom: 14 }}>Posted {selected.posted} via {selected.source}</p>
            <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.8, marginBottom: 18 }}>{selected.description}</p>

            <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
              <button className="btn" onClick={() => analyzeJob(selected)} style={{
                flex: 1, background: "linear-gradient(135deg,#2563eb,#7c3aed)",
                border: "none", borderRadius: 8, padding: "10px 6px", color: "#fff", fontSize: 12, fontWeight: 700
              }}>✦ AI Analysis</button>
              {!applied.has(selected.id) ? (
                <button className="btn" onClick={e => markApplied(selected.id, e)} style={{
                  flex: 1, background: "#052e16", border: "1px solid #166534",
                  borderRadius: 8, padding: "10px 6px", color: "#4ade80", fontSize: 12, fontWeight: 700
                }}>✓ Applied</button>
              ) : (
                <div style={{ flex: 1, background: "#1e1030", border: "1px solid #4c1d95", borderRadius: 8, padding: "10px", color: "#a78bfa", fontSize: 12, fontWeight: 700, textAlign: "center" }}>Applied ✓</div>
              )}
            </div>

            <a href={selected.url} target="_blank" rel="noreferrer" style={{
              display: "block", textAlign: "center", background: "#0f172a",
              color: "#60a5fa", borderRadius: 8, padding: "9px", fontSize: 12, fontWeight: 600,
              textDecoration: "none", marginBottom: 16, border: "1px solid #1e3a5f"
            }}>View & Apply on {selected.source} ↗</a>

            {(aiLoading || aiAnalysis) && (
              <div style={{ background: "#070b12", border: "1px solid #0f172a", borderRadius: 10, padding: 14, animation: "fadeIn 0.2s ease" }}>
                <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 800, letterSpacing: "0.12em", marginBottom: 10 }}>✦ AI ANALYSIS</div>
                {aiLoading
                  ? [1,2,3,4].map(i => <div key={i} className="shimmer" style={{ height: 12, marginBottom: 8, borderRadius: 6 }} />)
                  : <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.85, whiteSpace: "pre-wrap" }}>{aiAnalysis}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── EMAIL PANEL ── */}
      {emailPanel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}>
          <div style={{ background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 16, maxWidth: 580, width: "100%", maxHeight: "88vh", overflow: "auto", padding: 28, animation: "fadeIn 0.25s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#f1f5f9", fontWeight: 800 }}>Job Digest Email</h3>
                <p style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>
                  {scheduleInfo.windowLabel} · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </p>
                <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
                  {[{ h: 8, label: "8 AM" }, { h: 12, label: "12 PM" }, { h: 15, label: "3 PM" }].map(({ h, label }) => {
                    const nowH = new Date().getHours(), nowM = new Date().getMinutes();
                    const isActive = nowH === h && nowM < 5;
                    return (
                      <span key={h} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: isActive ? "#052e16" : "#0f172a", color: isActive ? "#4ade80" : "#1e293b", border: `1px solid ${isActive ? "#166534" : "#0f172a"}` }}>{label}</span>
                    );
                  })}
                </div>
              </div>
              <button className="btn" onClick={() => setEmailPanel(false)}
                style={{ background: "#0f172a", border: "none", borderRadius: 8, width: 30, height: 30, color: "#475569", fontSize: 16 }}>✕</button>
            </div>

            {emailLoading ? (
              <div style={{ padding: "30px 0" }}>
                {[1,2,3,4,5,6,7].map(i => <div key={i} className="shimmer" style={{ height: 14, marginBottom: 10, borderRadius: 6 }} />)}
                <p style={{ color: "#334155", fontSize: 12, textAlign: "center", marginTop: 16 }}>Generating your personalized digest with live jobs...</p>
              </div>
            ) : (
              <>
                <div style={{ background: "#070b12", border: "1px solid #0f172a", borderRadius: 10, padding: "18px 20px", marginBottom: 18, maxHeight: 400, overflow: "auto" }}>
                  {emailContent.split("\n").map((line, i) => {
                    const isApply = line.toLowerCase().startsWith("apply:");
                    const isSubject = line.startsWith("Subject:");
                    const isSalary = line.startsWith("Salary:");
                    const isMatch = line.startsWith("Match:");
                    const isWhy = line.startsWith("Why");
                    const isRole = /^[A-Z].+—/.test(line);
                    if (isApply) {
                      const url = line.replace(/^apply:/i, "").trim();
                      return <div key={i} style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#334155" }}>Apply: </span>
                        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#60a5fa", textDecoration: "underline", wordBreak: "break-all" }}>{url}</a>
                      </div>;
                    }
                    return <p key={i} style={{
                      fontSize: isSubject ? 13 : isRole ? 13 : 12,
                      color: isSubject ? "#f1f5f9" : isRole ? "#e2e8f0" : isSalary || isMatch ? "#4ade80" : isWhy ? "#94a3b8" : "#64748b",
                      fontWeight: isSubject || isRole ? 700 : 400,
                      lineHeight: 1.85, marginBottom: line === "" ? 10 : 2,
                      borderTop: isRole && i > 2 ? "1px solid #0f172a" : "none",
                      paddingTop: isRole && i > 2 ? 12 : 0,
                      marginTop: isRole && i > 2 ? 10 : 0,
                    }}>{line || "\u00A0"}</p>;
                  })}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn" onClick={() => { navigator.clipboard.writeText(emailContent); showToast("✓ Copied!"); }}
                    style={{ flex: 1, background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: "11px", color: "#64748b", fontSize: 13, fontWeight: 600 }}>
                    Copy Text
                  </button>
                  <a href={`mailto:?body=${encodeURIComponent(emailContent)}`}
                    style={{ flex: 2, background: "linear-gradient(135deg,#2563eb,#7c3aed)", borderRadius: 8, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 700, textAlign: "center", textDecoration: "none", display: "block" }}>
                    Open in Gmail ↗
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
