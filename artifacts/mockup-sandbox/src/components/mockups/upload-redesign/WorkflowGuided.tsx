import { useState } from "react";
import {
  Upload, FileSpreadsheet, ListChecks, Link2, CheckCircle,
  ChevronRight, CloudUpload, Building2, Users, Plane, Radio, ArrowLeft, X,
} from "lucide-react";

const ORGS = [
  { code: "FAAN", name: "Federal Airports Authority of Nigeria", icon: <Plane className="w-5 h-5" />, members: 214 },
  { code: "NAMA", name: "Nigerian Airspace Management Agency", icon: <Radio className="w-5 h-5" />, members: 187 },
  { code: "NIMET", name: "Nigerian Meteorological Agency", icon: <Building2 className="w-5 h-5" />, members: 53 },
  { code: "COOP", name: "Cooperative Staff (Internal)", icon: <Users className="w-5 h-5" />, members: 12 },
];

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const UPLOAD_TYPES = [
  {
    value: "standalone",
    icon: <Upload className="w-6 h-6" />,
    label: "Standalone Upload",
    subtitle: "Direct · No roster",
    desc: "Best for orgs that send a single sheet combining payroll and deductions. Transactions are created immediately.",
    accent: "#6366f1",
    bg: "#eef2ff",
    border: "#c7d2fe",
  },
  {
    value: "payroll_summary",
    icon: <ListChecks className="w-6 h-6" />,
    label: "Payroll Roster",
    subtitle: "Step 1 of 2",
    desc: "Upload the head-office payroll to save this month's active member list. No transactions created yet.",
    accent: "#0284c7",
    bg: "#e0f2fe",
    border: "#bae6fd",
  },
  {
    value: "category_breakdown",
    icon: <Link2 className="w-6 h-6" />,
    label: "Cooperative Archive",
    subtitle: "Step 2 of 2",
    desc: "The cooperative deduction sheet, cross-checked against a saved payroll roster. Absent members are roster-skipped.",
    accent: "#7c3aed",
    bg: "#f3e8ff",
    border: "#ddd6fe",
  },
];

type Step = "org" | "type" | "period" | "file";
const STEPS: Step[] = ["org", "type", "period", "file"];
const STEP_LABELS = ["Organisation", "Upload Type", "Period", "File"];

export function WorkflowGuided() {
  const [step, setStep] = useState<Step>("org");
  const [org, setOrg] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<string | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [year] = useState(2026);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<string | null>(null);

  const currentIdx = STEPS.indexOf(step);

  function next(to: Step) {
    setStep(to);
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex flex-col font-sans">

      {/* ── Top progress bar ── */}
      <div className="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const done = i < currentIdx;
            const active = s === step;
            return (
              <div key={s} className="flex items-center gap-1">
                <button
                  onClick={() => i < currentIdx && setStep(s)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                    active ? "bg-indigo-600 text-white" :
                    done ? "bg-indigo-100 text-indigo-600 hover:bg-indigo-200 cursor-pointer" :
                    "bg-slate-100 text-slate-400 cursor-default"
                  }`}
                >
                  {done ? <CheckCircle className="w-3 h-3" /> : <span>{i + 1}</span>}
                  {STEP_LABELS[i]}
                </button>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="w-3 h-3 text-slate-300" />
                )}
              </div>
            );
          })}
        </div>
        <div className="ml-auto">
          <div className="h-1.5 w-32 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${((currentIdx + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex items-start justify-center px-6 py-10">
        <div className="w-full max-w-xl">

          {/* ── STEP: Organisation ── */}
          {step === "org" && (
            <div>
              <div className="mb-6">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Step 1 of 4</p>
                <h2 className="text-2xl font-bold text-slate-800 mt-1">Which organisation is this sheet from?</h2>
                <p className="text-sm text-slate-400 mt-1">Select the employer whose deduction sheet you're uploading.</p>
              </div>
              <div className="space-y-2.5">
                {ORGS.map((o) => (
                  <button
                    key={o.code}
                    onClick={() => { setOrg(o.code); next("type"); }}
                    className={`w-full flex items-center gap-4 rounded-2xl px-5 py-4 text-left border-2 transition-all hover:shadow-sm ${
                      org === o.code
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 bg-white hover:border-indigo-300"
                    }`}
                  >
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                      org === o.code ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                    }`}>
                      {o.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800">{o.code}</p>
                      <p className="text-[12px] text-slate-400 truncate">{o.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-700">{o.members}</p>
                      <p className="text-[10px] text-slate-400">members</p>
                    </div>
                    <ChevronRight className={`w-4 h-4 shrink-0 ${org === o.code ? "text-indigo-500" : "text-slate-300"}`} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP: Upload type ── */}
          {step === "type" && (
            <div>
              <button onClick={() => setStep("org")} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mb-5 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Organisation
              </button>
              <div className="mb-6">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Step 2 of 4</p>
                <h2 className="text-2xl font-bold text-slate-800 mt-1">What kind of upload is this?</h2>
                <p className="text-sm text-slate-400 mt-1">Uploading for <span className="font-semibold text-slate-600">{org}</span>.</p>
              </div>
              <div className="space-y-3">
                {UPLOAD_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => { setUploadType(t.value); next("period"); }}
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all text-left overflow-hidden"
                  >
                    <div className="flex items-start gap-4 px-5 py-4">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: t.bg, color: t.accent }}
                      >
                        {t.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-800">{t.label}</p>
                          <span
                            className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md"
                            style={{ background: t.bg, color: t.accent }}
                          >
                            {t.subtitle}
                          </span>
                        </div>
                        <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">{t.desc}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-2" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP: Period ── */}
          {step === "period" && (
            <div>
              <button onClick={() => setStep("type")} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mb-5 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Upload Type
              </button>
              <div className="mb-6">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Step 3 of 4</p>
                <h2 className="text-2xl font-bold text-slate-800 mt-1">Which month does this sheet cover?</h2>
                <p className="text-sm text-slate-400 mt-1">{org} · {uploadType === "payroll_summary" ? "Payroll Roster" : uploadType === "category_breakdown" ? "Cooperative Archive" : "Standalone"} · {year}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-slate-600">Select month for {year}</p>
                  <div className="flex items-center gap-1">
                    <button className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-xs font-bold">‹</button>
                    <span className="text-sm font-bold text-slate-700 px-1">{year}</span>
                    <button className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-xs font-bold">›</button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {MONTHS.map((m, i) => {
                    const isCurrent = i === new Date().getMonth();
                    const isSelected = month === i;
                    return (
                      <button
                        key={m}
                        onClick={() => setMonth(i)}
                        className={`relative rounded-xl py-3 text-sm font-semibold transition-all ${
                          isSelected
                            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                            : isCurrent
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {m.slice(0, 3)}
                        {isCurrent && !isSelected && (
                          <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-indigo-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {month !== null && (
                  <div className="mt-4 flex items-center justify-between">
                    <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-2 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-indigo-600" />
                      <span className="text-sm font-semibold text-indigo-700">{MONTHS[month]} {year}</span>
                    </div>
                    <button
                      onClick={() => next("file")}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
                    >
                      Confirm <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP: File ── */}
          {step === "file" && (
            <div>
              <button onClick={() => setStep("period")} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mb-5 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Period
              </button>
              <div className="mb-6">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Step 4 of 4</p>
                <h2 className="text-2xl font-bold text-slate-800 mt-1">Upload the spreadsheet</h2>
                <p className="text-sm text-slate-400 mt-1">
                  {org} · {month !== null ? `${MONTHS[month]} ${year}` : year} · {uploadType === "payroll_summary" ? "Payroll Roster" : uploadType === "category_breakdown" ? "Cooperative Archive" : "Standalone"}
                </p>
              </div>

              {/* Summary pill row */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {[
                  { label: org ?? "", color: "bg-indigo-100 text-indigo-700" },
                  { label: month !== null ? `${MONTHS[month]} ${year}` : `${year}`, color: "bg-slate-100 text-slate-600" },
                  { label: uploadType === "payroll_summary" ? "Payroll Roster" : uploadType === "category_breakdown" ? "Coop Archive" : "Standalone", color: "bg-violet-100 text-violet-700" },
                ].map((p) => (
                  <span key={p.label} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${p.color}`}>{p.label}</span>
                ))}
              </div>

              {file ? (
                <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-emerald-800 truncate">{file}</p>
                      <p className="text-xs text-emerald-500 mt-0.5">1 sheet detected · 214 data rows</p>
                    </div>
                    <button onClick={() => setFile(null)} className="text-emerald-400 hover:text-emerald-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <button className="mt-4 w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-200">
                    <Upload className="w-4 h-4" />
                    Upload & Preview Sheet
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); setFile("FAAN_July2026.xlsx"); }}
                  onClick={() => setFile("FAAN_July2026.xlsx")}
                  className={`w-full rounded-2xl border-2 border-dashed transition-all py-12 flex flex-col items-center gap-3 cursor-pointer ${
                    dragOver
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"
                  }`}
                >
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${dragOver ? "bg-indigo-100" : "bg-slate-100"}`}>
                    <CloudUpload className={`w-8 h-8 ${dragOver ? "text-indigo-500" : "text-slate-400"}`} />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-semibold text-slate-700">Drop your .xlsx file here</p>
                    <p className="text-sm text-slate-400 mt-1">or <span className="text-indigo-600 font-semibold">browse your computer</span></p>
                    <p className="text-xs text-slate-300 mt-2">Supports .xlsx and .xls files</p>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom strip ── */}
      <div className="border-t border-slate-100 bg-white px-6 py-3 flex items-center justify-between">
        <p className="text-xs text-slate-400">Akure Airport Staff Cooperative · Monthly Upload</p>
        <p className="text-xs text-slate-300">{currentIdx + 1} / {STEPS.length} steps complete</p>
      </div>
    </div>
  );
}
