import { useState } from "react";
import {
  Upload, FileSpreadsheet, ListChecks, Link2, CheckCircle,
  AlertTriangle, ChevronRight, X, CloudUpload, Building2, Users, Plane, Radio,
} from "lucide-react";

const ORGS = [
  { code: "FAAN", name: "Federal Airports Authority", icon: <Plane className="w-4 h-4" />, color: "blue" },
  { code: "NAMA", name: "Nigerian Airspace Mgmt Agency", icon: <Radio className="w-4 h-4" />, color: "violet" },
  { code: "NIMET", name: "NiMet", icon: <Building2 className="w-4 h-4" />, color: "sky" },
  { code: "COOP", name: "Cooperative Staff", icon: <Users className="w-4 h-4" />, color: "emerald" },
];

const UPLOAD_TYPES = [
  {
    value: "standalone",
    icon: <Upload className="w-5 h-5" />,
    label: "Standalone Upload",
    pill: "Direct",
    desc: "Processes transactions immediately — no roster required.",
    pillColor: "bg-slate-100 text-slate-600",
  },
  {
    value: "payroll_summary",
    icon: <ListChecks className="w-5 h-5" />,
    label: "Payroll Roster",
    pill: "Step 1 of 2",
    desc: "Save the active member list from head-office payroll. No transactions created.",
    pillColor: "bg-sky-100 text-sky-700",
  },
  {
    value: "category_breakdown",
    icon: <Link2 className="w-5 h-5" />,
    label: "Cooperative Archive",
    pill: "Step 2 of 2",
    desc: "Deduction sheet linked to a payroll roster. Absent members are skipped.",
    pillColor: "bg-violet-100 text-violet-700",
  },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function ClarityFirst() {
  const [org, setOrg] = useState("FAAN");
  const [uploadType, setUploadType] = useState("standalone");
  const [month, setMonth] = useState(6); // July index
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#F5F6FA] p-6 font-sans">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* ── Header ── */}
        <div
          className="rounded-2xl p-5 text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 55%, #0ea5e9 100%)" }}
        >
          <div className="absolute -top-10 -right-8 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-12 -left-6 w-48 h-48 rounded-full bg-white/5 blur-3xl" />
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-200">Monthly Deductions</p>
            <h1 className="text-xl font-bold mt-0.5">Upload Deduction Sheet</h1>
            <p className="text-xs text-blue-100 mt-1">Members are matched by name and tagged automatically.</p>
          </div>

          {/* ── Redesigned stepper ── */}
          <div className="relative mt-4 flex items-center gap-0">
            {[
              { label: "Select", step: 1, active: true, done: false },
              { label: "Sheet", step: 2, active: false, done: false },
              { label: "Review", step: 3, active: false, done: false },
            ].map((s, i) => (
              <div key={s.label} className="flex items-center flex-1 last:flex-none">
                <div className={`flex items-center gap-2 ${s.active ? "opacity-100" : "opacity-50"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border-2 ${
                    s.done ? "bg-white border-white text-blue-700" :
                    s.active ? "bg-white border-white text-blue-700" :
                    "bg-transparent border-white/60 text-white"
                  }`}>
                    {s.done ? <CheckCircle className="w-3.5 h-3.5" /> : s.step}
                  </div>
                  <span className={`text-xs font-semibold hidden sm:block ${s.active ? "text-white" : "text-white/70"}`}>
                    {s.label}
                  </span>
                </div>
                {i < 2 && (
                  <div className="flex-1 mx-3 h-px bg-white/30" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Organisation selector ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Organisation</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Which employer does this sheet belong to?</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ORGS.map((o) => (
              <button
                key={o.code}
                onClick={() => setOrg(o.code)}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-left border-2 transition-all ${
                  org === o.code
                    ? "border-blue-600 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  org === o.code ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                  {o.icon}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-bold leading-tight ${org === o.code ? "text-blue-700" : "text-slate-700"}`}>
                    {o.code}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">{o.name}</p>
                </div>
                {org === o.code && (
                  <CheckCircle className="w-4 h-4 text-blue-600 ml-auto shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Upload type ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Upload Type</p>
          <div className="space-y-2">
            {UPLOAD_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setUploadType(t.value)}
                className={`w-full flex items-start gap-4 rounded-xl px-4 py-3.5 text-left border-2 transition-all ${
                  uploadType === t.value
                    ? "border-blue-600 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  uploadType === t.value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
                }`}>
                  {t.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${uploadType === t.value ? "text-blue-700" : "text-slate-700"}`}>
                      {t.label}
                    </p>
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md ${t.pillColor}`}>
                      {t.pill}
                    </span>
                  </div>
                  <p className={`text-[11px] mt-0.5 leading-relaxed ${uploadType === t.value ? "text-blue-600/80" : "text-slate-400"}`}>
                    {t.desc}
                  </p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 mt-1 shrink-0 flex items-center justify-center ${
                  uploadType === t.value ? "border-blue-600 bg-blue-600" : "border-slate-300"
                }`}>
                  {uploadType === t.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Period ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Deduction Period</p>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] text-slate-400 mb-1.5">Month</p>
              <div className="grid grid-cols-6 gap-1">
                {MONTHS.map((m, i) => (
                  <button
                    key={m}
                    onClick={() => setMonth(i)}
                    className={`rounded-lg py-1.5 text-[11px] font-semibold transition-all ${
                      month === i
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-[11px] text-slate-400 mb-1">Selected</p>
                <div className="h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center px-3">
                  <p className="text-sm font-semibold text-blue-700">{MONTH_FULL[month]} 2026</p>
                </div>
              </div>
              <div className="w-24">
                <p className="text-[11px] text-slate-400 mb-1">Year</p>
                <input
                  type="number"
                  defaultValue={2026}
                  className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── File drop zone ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Excel File</p>
          {file ? (
            <div className="flex items-center gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-700 truncate">{file}</p>
                <p className="text-[11px] text-emerald-500 mt-0.5">Ready to upload</p>
              </div>
              <button onClick={() => setFile(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); setFile("FAAN_July2026.xlsx"); }}
              onClick={() => setFile("FAAN_July2026.xlsx")}
              className={`w-full rounded-xl border-2 border-dashed transition-all py-8 flex flex-col items-center gap-2 ${
                dragOver
                  ? "border-blue-400 bg-blue-50"
                  : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${dragOver ? "bg-blue-100" : "bg-slate-100"}`}>
                <CloudUpload className={`w-6 h-6 ${dragOver ? "text-blue-500" : "text-slate-400"}`} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-600">Drop your .xlsx file here</p>
                <p className="text-[11px] text-slate-400 mt-0.5">or click to browse</p>
              </div>
            </button>
          )}
        </div>

        {/* ── Submit ── */}
        <button
          onClick={() => setFile("FAAN_July2026.xlsx")}
          className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all"
        >
          <Upload className="w-4 h-4" />
          Upload & Preview
          <ChevronRight className="w-4 h-4 ml-1" />
        </button>

        <p className="text-center text-[11px] text-slate-400">Step 1 of 3 — file and period selection</p>
      </div>
    </div>
  );
}
