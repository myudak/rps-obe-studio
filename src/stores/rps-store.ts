import { create } from "zustand"

import type { ApiKeyStorageMode, AppPreferences } from "@/lib/persistence-types"

import {
  createEmptyRps,
  createExampleRps,
  rpsSchema,
  type Assessment,
  type Cpl,
  type Cpmk,
  type RpsData,
  type RpsMeta,
  type Rubric,
  type ScheduleRow,
} from "@/schemas/rps-schema"

export const STEPS = ["identity", "outcomes", "schedule", "assessment", "final"] as const
export type StepId = (typeof STEPS)[number]
export const DEFAULT_AI_MODEL = "z-ai/glm-5.3-flash"

type RpsStore = {
  data: RpsData
  activeStep: StepId
  selectedModel: string
  temperature: number
  apiKeyStorageMode: ApiKeyStorageMode
  hydrate: (data: RpsData | null, preferences: AppPreferences) => void
  setActiveStep: (step: StepId) => void
  setSelectedModel: (model: string) => void
  setTemperature: (temperature: number) => void
  setApiKeyStorageMode: (mode: ApiKeyStorageMode) => void
  setData: (data: RpsData) => void
  updateMeta: (key: keyof RpsMeta, value: string | number) => void
  updateCpl: (index: number, patch: Partial<Cpl>) => void
  updateCpmk: (index: number, patch: Partial<Cpmk>) => void
  addCpmk: () => void
  removeCpmk: (index: number) => void
  updateSchedule: (index: number, patch: Partial<ScheduleRow>) => void
  updateAssessment: (index: number, patch: Partial<Assessment>) => void
  addAssessment: () => void
  removeAssessment: (index: number) => void
  updateRubric: (index: number, patch: Partial<Rubric>) => void
  addRubric: () => void
  removeRubric: (index: number) => void
  updateReferences: (kind: "main" | "additional", index: number, value: string) => void
  addReference: (kind: "main" | "additional") => void
  removeReference: (kind: "main" | "additional", index: number) => void
  updateValidation: (key: keyof RpsData["validation"], value: string) => void
  loadExample: () => void
  reset: () => void
  importData: (value: unknown) => { ok: true } | { ok: false; error: string }
}

const touch = (data: RpsData): RpsData => ({ ...data, updatedAt: new Date().toISOString() })

export const useRpsStore = create<RpsStore>()((set) => ({
  data: createEmptyRps(),
  activeStep: "identity",
  selectedModel: DEFAULT_AI_MODEL,
  temperature: 0.2,
  apiKeyStorageMode: "memory",
  hydrate: (data, preferences) => set({
    data: data ?? createEmptyRps(),
    activeStep: preferences.activeStep,
    selectedModel: preferences.selectedModel,
    temperature: preferences.temperature,
    apiKeyStorageMode: preferences.apiKeyStorageMode,
  }),
  setActiveStep: (activeStep) => set({ activeStep }),
  setSelectedModel: (selectedModel) => set({ selectedModel }),
  setTemperature: (temperature) => set({ temperature }),
  setApiKeyStorageMode: (apiKeyStorageMode) => set({ apiKeyStorageMode }),
  setData: (data) => set({ data: touch(data) }),
  updateMeta: (key, value) => set((state) => ({ data: touch({ ...state.data, meta: { ...state.data.meta, [key]: value } }) })),
  updateCpl: (index, patch) => set((state) => ({
    data: touch({ ...state.data, cpl: state.data.cpl.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }),
  })),
  updateCpmk: (index, patch) => set((state) => {
    const oldCode = state.data.cpmk[index]?.code
    const newCode = patch.code ?? oldCode
    const renamed = oldCode && newCode !== oldCode
    return {
      data: touch({
        ...state.data,
        cpmk: state.data.cpmk.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
        schedule: renamed ? state.data.schedule.map((item) => item.cpmk === oldCode ? { ...item, cpmk: newCode } : item) : state.data.schedule,
        assessments: renamed ? state.data.assessments.map((item) => ({ ...item, cpmk: item.cpmk.map((code) => code === oldCode ? newCode : code) })) : state.data.assessments,
        rubrics: renamed ? state.data.rubrics.map((item) => item.cpmk === oldCode ? { ...item, cpmk: newCode } : item) : state.data.rubrics,
      }),
    }
  }),
  addCpmk: () => set((state) => ({ data: touch({ ...state.data, cpmk: [...state.data.cpmk, { code: `CPMK ${state.data.cpmk.length + 1}`, text: "", en: "", weight: 0, maps: { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, h: 0, i: 0, j: 0 } }] }) })),
  removeCpmk: (index) => set((state) => {
    if (state.data.cpmk.length <= 1) return state
    const removed = state.data.cpmk[index]?.code
    const remaining = state.data.cpmk.filter((_, itemIndex) => itemIndex !== index)
    const fallback = remaining[0]?.code ?? ""
    return { data: touch({ ...state.data, cpmk: remaining, schedule: state.data.schedule.map(item => item.cpmk === removed ? { ...item, cpmk: fallback } : item), assessments: state.data.assessments.map(item => ({ ...item, cpmk: item.cpmk.filter(code => code !== removed) })), rubrics: state.data.rubrics.map(item => item.cpmk === removed ? { ...item, cpmk: fallback } : item) }) }
  }),
  updateSchedule: (index, patch) => set((state) => ({
    data: touch({ ...state.data, schedule: state.data.schedule.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }),
  })),
  updateAssessment: (index, patch) => set((state) => ({
    data: touch({ ...state.data, assessments: state.data.assessments.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }),
  })),
  addAssessment: () => set((state) => ({ data: touch({ ...state.data, assessments: [...state.data.assessments, { name: `Assessment ${state.data.assessments.length + 1}`, weight: 0, cpmk: [], notes: "" }] }) })),
  removeAssessment: (index) => set((state) => state.data.assessments.length <= 1 ? state : ({ data: touch({ ...state.data, assessments: state.data.assessments.filter((_, itemIndex) => itemIndex !== index) }) })),
  updateRubric: (index, patch) => set((state) => ({
    data: touch({ ...state.data, rubrics: state.data.rubrics.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }),
  })),
  addRubric: () => set((state) => ({ data: touch({ ...state.data, rubrics: [...state.data.rubrics, { criterion: `Kriteria ${state.data.rubrics.length + 1}`, cpmk: state.data.cpmk[0]?.code ?? "", weight: 0, level4: "", level3: "", level2: "", level1: "" }] }) })),
  removeRubric: (index) => set((state) => state.data.rubrics.length <= 1 ? state : ({ data: touch({ ...state.data, rubrics: state.data.rubrics.filter((_, itemIndex) => itemIndex !== index) }) })),
  updateReferences: (kind, index, value) => set((state) => ({
    data: touch({
      ...state.data,
      references: {
        ...state.data.references,
        [kind]: state.data.references[kind].map((item, itemIndex) => itemIndex === index ? value : item),
      },
    }),
  })),
  addReference: (kind) => set((state) => ({ data: touch({ ...state.data, references: { ...state.data.references, [kind]: [...state.data.references[kind], ""] } }) })),
  removeReference: (kind, index) => set((state) => ({ data: touch({ ...state.data, references: { ...state.data.references, [kind]: state.data.references[kind].filter((_, itemIndex) => itemIndex !== index) } }) })),
  updateValidation: (key, value) => set((state) => ({
    data: touch({ ...state.data, validation: { ...state.data.validation, [key]: value } }),
  })),
  loadExample: () => set({ data: createExampleRps(), activeStep: "identity" }),
  reset: () => set({ data: createEmptyRps(), activeStep: "identity" }),
  importData: (value) => {
    const result = rpsSchema.safeParse(value)
    if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? "Format RPS tidak valid" }
    set({ data: touch(result.data), activeStep: "identity" })
    return { ok: true }
  },
}))
