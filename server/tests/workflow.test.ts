import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { test } from "node:test"
import ExcelJS from "exceljs"
import { MockLanguageModelV3, simulateReadableStream } from "ai/test"
import { eq } from "drizzle-orm"
import { createApp } from "../app.ts"
import { auth } from "../auth.ts"
import { closeDatabase, db, sqlClient } from "../db/client.ts"
import * as s from "../db/schema.ts"
import { env } from "../env.ts"
import { createExampleRps } from "../../src/schemas/rps-schema.ts"
import { errorMessage } from "../../src/platform/errors.ts"
import { validateImportRows } from "../routes/import-routes.ts"

test("normalizes API error response shapes", () => {
  assert.equal(errorMessage({ error: { message: "Nested failure" } }, 400), "Nested failure")
  assert.equal(errorMessage({ message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" }, 401), "Invalid email or password")
  assert.equal(errorMessage({ error: "Server failure" }, 500), "Server failure")
  assert.ok(!errorMessage({ other: true }, 500).includes("object"))
  assert.ok(!errorMessage("<html>Proxy failure</html>", 502).includes("html"))
})
test("import row validation rejects duplicates and invalid scores", () => {
  const rows = validateImportRows([{ nim: "001", kode_assessment: "A1", nilai: "50" }, { nim: "001", kode_assessment: "A1", nilai: "101" }], "scores")
  assert.equal(rows[0]!.errors.length, 0); assert.equal(rows[1]!.errors.length, 2)
})

test("PostgreSQL academic workflow and access boundaries", async () => {
  assert.equal(new URL(env.databaseUrl).pathname, "/rps_obe_test", "Integration tests require the dedicated rps_obe_test database")
  let streamFailure = false
  const model = new MockLanguageModelV3({ doStream: async () => ({ stream: streamFailure ? simulateReadableStream({ chunks: [{ type: "error" as const, error: new Error("Mock provider failure") }] }) : simulateReadableStream({ chunks: [
    { type: "text-start" as const, id: "answer" }, { type: "text-delta" as const, id: "answer", delta: "Halo dari model uji." }, { type: "text-end" as const, id: "answer" },
    { type: "finish" as const, finishReason: { unified: "stop" as const, raw: "stop" }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } } },
  ] }) }) })
  const app = await createApp(false, model); const suffix = randomUUID().slice(0, 8)
  const [program] = await db.insert(s.programs).values({ code: `T-${suffix}`, name: "Integration Informatika", faculty: "Test FSM" }).returning()
  const [otherProgram] = await db.insert(s.programs).values({ code: `O-${suffix}`, name: "Other program", faculty: "Test FSM" }).returning()
  const [curriculum] = await db.insert(s.curricula).values({ programId: program!.id, code: suffix, name: "Test curriculum" }).returning()
  const [cohort] = await db.insert(s.cohorts).values({ programId: program!.id, curriculumId: curriculum!.id, entryYear: 2099, name: "Test 2099" }).returning()
  const [period] = await db.insert(s.periods).values({ code: suffix, name: "Test period", startsOn: "2099-01-01", endsOn: "2099-06-30" }).returning()
  const [course] = await db.insert(s.courses).values({ programId: program!.id, code: suffix, name: "Test course", credits: 3 }).returning()
  const [placement] = await db.insert(s.curriculumCourses).values({ curriculumId: curriculum!.id, courseId: course!.id, semester: 1 }).returning()
  const actors: Record<string, { cookie: string; profileId: string }> = {}
  async function request(actor: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown, expected = 200, headers: Record<string, string> = {}) {
    const response = await app.inject({ method, url, headers: { origin: env.clientOrigin, ...(actor ? { cookie: actors[actor]!.cookie } : {}), ...headers }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
    assert.equal(response.statusCode, expected, `${method} ${url}: ${response.body.slice(0, 300)}`)
    return response
  }
  try {
    for (const role of ["SUPERADMIN", "ADMIN_PRODI", "DOSEN_PENGAMPU", "GPM", "KAPRODI", "MAHASISWA", "OUTSIDER"]) {
      const email = `${role.toLowerCase()}-${suffix}@test.local`; const password = `Test-${suffix}-secure!`
      await auth.api.signUpEmail({ body: { name: `Test ${role}`, email, password } })
      const [user] = await db.select().from(s.user).where(eq(s.user.email, email))
      if (role === "SUPERADMIN") await db.update(s.user).set({ role: "admin" }).where(eq(s.user.id, user!.id))
      const [profile] = await db.insert(s.profiles).values({ userId: user!.id }).returning()
      const code = role === "OUTSIDER" ? "GPM" : role
      await db.insert(s.roles).values({ code, name: code }).onConflictDoNothing()
      const [roleRow] = await db.select().from(s.roles).where(eq(s.roles.code, code))
      await db.insert(s.userRoles).values({ profileId: profile!.id, roleId: roleRow!.id, programId: role === "OUTSIDER" ? otherProgram!.id : program!.id })
      const response = await app.inject({ method: "POST", url: "/api/auth/sign-in/email", headers: { origin: env.clientOrigin }, payload: { email, password } })
      assert.equal(response.statusCode, 200)
      actors[role] = { cookie: response.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; "), profileId: profile!.id }
    }
    await request("", "GET", "/api/platform", undefined, 401)
    const invalid = await request("", "POST", "/api/auth/sign-in/email", { email: `admin_prodi-${suffix}@test.local`, password: "wrong-password" }, 401)
    assert.match(errorMessage(invalid.json(), 401), /password|email/i)
    const section = (await request("ADMIN_PRODI", "POST", "/api/admin/classes", { curriculumCourseId: placement!.id, cohortId: cohort!.id, periodId: period!.id, code: suffix, name: "Integration class", capacity: 3 }, 201)).json()
    const id = section.id as string
    await request("ADMIN_PRODI", "POST", `/api/classes/${id}/teachers`, { profileId: actors.DOSEN_PENGAMPU!.profileId })
    await request("OUTSIDER", "GET", `/api/classes/${id}`, undefined, 403)
    await request("MAHASISWA", "GET", `/api/classes/${id}`, undefined, 403)
    async function preview(kind: string, content: string | Buffer, name = "import.csv") {
      const boundary = `boundary-${suffix}`
      const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), Buffer.from(content), Buffer.from(`\r\n--${boundary}--\r\n`)])
      const response = await app.inject({ method: "POST", url: `/api/classes/${id}/imports/${kind}/preview`, headers: { cookie: actors.ADMIN_PRODI!.cookie, "content-type": `multipart/form-data; boundary=${boundary}` }, payload })
      assert.equal(response.statusCode, 200, response.body); return response.json()
    }
    const nim = `T${suffix}`
    const roster = await preview("participants", `nim,nama,kode_angkatan\n${nim},Student test,2099\n`)
    assert.equal(roster.valid, true)
    await request("ADMIN_PRODI", "POST", `/api/classes/${id}/imports/participants/commit`, { token: roster.token })
    await request("ADMIN_PRODI", "POST", `/api/classes/${id}/imports/participants/commit`, { token: roster.token }, 409)
    const dup = await preview("participants", `nim,nama,kode_angkatan\n${nim},Student test,2099\n`); assert.equal(dup.valid, false)
    await db.update(s.students).set({ profileId: actors.MAHASISWA!.profileId }).where(eq(s.students.nim, nim))
    const source = createExampleRps()
    let rps = (await request("DOSEN_PENGAMPU", "POST", "/api/rps", { classId: id, data: source }, 201)).json()
    const streamed = await request("DOSEN_PENGAMPU", "POST", "/api/ai/chat", { rpsId: rps.id, prompt: "Uji", history: [{ role: "user", content: "Riwayat uji" }, { role: "assistant", content: "Jawaban sebelumnya" }] })
    assert.match(streamed.body, /Halo dari model uji/); assert.match(streamed.body, /"type":"done"/)
    assert.equal(model.doStreamCalls[0]!.prompt.filter(item => item.role === "user").length, 2)
    streamFailure = true
    const failedStream = await request("DOSEN_PENGAMPU", "POST", "/api/ai/chat", { rpsId: rps.id, prompt: "Uji error" }, 502)
    assert.match(failedStream.body, /"type":"error"/); assert.doesNotMatch(failedStream.body, /Mock provider failure/)
    await request("DOSEN_PENGAMPU", "PUT", `/api/rps/${rps.id}`, source, 409)
    rps = (await request("DOSEN_PENGAMPU", "PUT", `/api/rps/${rps.id}`, source, 200, { "if-match": String(rps.revision) })).json()
    await request("DOSEN_PENGAMPU", "POST", `/api/rps/${rps.id}/submit`)
    await request("KAPRODI", "POST", `/api/rps/${rps.id}/verify`, undefined, 403)
    await request("GPM", "POST", `/api/rps/${rps.id}/revision`, { comment: "Perbaiki contoh" })
    await request("DOSEN_PENGAMPU", "POST", `/api/rps/${rps.id}/submit`)
    const [gpmRole] = await db.select().from(s.roles).where(eq(s.roles.code, "GPM"))
    await db.insert(s.userRoles).values({ profileId: actors.DOSEN_PENGAMPU!.profileId, roleId: gpmRole!.id, programId: program!.id })
    await request("DOSEN_PENGAMPU", "POST", `/api/rps/${rps.id}/verify`, undefined, 403)
    const simultaneous = await Promise.all([1, 2].map(() => app.inject({ method: "POST", url: `/api/rps/${rps.id}/verify`, headers: { cookie: actors.GPM!.cookie } })))
    assert.equal(simultaneous.filter(item => item.statusCode === 200).length, 1)
    assert.equal((await request("GPM", "GET", `/api/rps/${rps.id}`)).json().status, "submitted")
    await request("KAPRODI", "POST", `/api/rps/${rps.id}/verify`)
    await request("DOSEN_PENGAMPU", "PUT", `/api/rps/${rps.id}`, source, 409, { "if-unmodified-since": rps.updatedAt })
    await request("DOSEN_PENGAMPU", "POST", `/api/classes/${id}/assessments/sync`)
    let outcomes = (await request("DOSEN_PENGAMPU", "GET", `/api/classes/${id}/outcomes`)).json()
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Data"); sheet.addRow(["nim", "kode_assessment", "nilai"])
    for (const assessment of outcomes.assessments) sheet.addRow([nim, assessment.code, "40"])
    const scorePreview = await preview("scores", Buffer.from(await workbook.xlsx.writeBuffer()), "scores.xlsx")
    assert.equal(scorePreview.valid, true)
    await request("ADMIN_PRODI", "POST", `/api/classes/${id}/imports/scores/commit`, { token: scorePreview.token })
    const overwrite = await preview("scores", `nim,kode_assessment,nilai\n${nim},A1,45\n`)
    assert.equal(overwrite.overwrites, 1)
    await request("ADMIN_PRODI", "POST", `/api/classes/${id}/imports/scores/commit`, { token: overwrite.token }, 409)
    const confirmed = await preview("scores", `nim,kode_assessment,nilai\n${nim},A1,45\n`)
    await request("ADMIN_PRODI", "POST", `/api/classes/${id}/imports/scores/commit`, { token: confirmed.token, overwrite: true })
    assert.equal((await request("MAHASISWA", "GET", `/api/classes/${id}/outcomes`)).json().scores.length, 0)
    outcomes = (await request("DOSEN_PENGAMPU", "GET", `/api/classes/${id}/outcomes`)).json()
    for (const score of outcomes.scores) await request("DOSEN_PENGAMPU", "POST", `/api/scores/${score.id}/release`)
    await request("DOSEN_PENGAMPU", "PUT", "/api/scores", { enrollmentId: outcomes.enrollments[0].id, assessmentId: outcomes.assessments[0].id, rawScore: 99 }, 409)
    assert.equal((await preview("scores", `nim,kode_assessment,nilai\n${nim},A1,99\n`)).valid, false)
    await request("DOSEN_PENGAMPU", "POST", `/api/classes/${id}/calculate`)
    const calculated = (await request("DOSEN_PENGAMPU", "GET", `/api/classes/${id}/outcomes`)).json()
    assert.ok(calculated.achievements.some((item: { scope: string }) => item.scope === "class-cpl"), "CPL roll-up should be stored")
    const curriculumWorkspace = (await request("GPM", "GET", `/api/curricula/${curriculum!.id}/workspace`)).json()
    assert.ok(curriculumWorkspace.outcomes.length >= 6)
    assert.ok(curriculumWorkspace.mappings.length > 0)
    const courseWorkspace = (await request("DOSEN_PENGAMPU", "GET", `/api/course-workspaces/${placement!.id}`)).json()
    assert.ok(courseWorkspace.outcomes.length >= 6)
    await request("DOSEN_PENGAMPU", "POST", `/api/course-outcomes/${courseWorkspace.outcomes[0].id}/sub-outcomes`, { code: `SUB-${suffix}`, description: "First-class integration sub outcome", weight: 100, sortOrder: 1 }, 201)
    const proposal = (await request("DOSEN_PENGAMPU", "POST", `/api/course-workspaces/${placement!.id}/proposals`, { title: "Improve outcome alignment", rationale: "Assessment evidence indicates a curriculum adjustment is needed.", changes: { cpmk: "updated" } }, 201)).json()
    assert.equal(proposal.impact.activeClasses, 1)
    await request("DOSEN_PENGAMPU", "POST", `/api/curriculum-proposals/${proposal.id}/decision`, { decision: "approved", comment: "Self approval denied" }, 403)
    await request("GPM", "POST", `/api/curriculum-proposals/${proposal.id}/decision`, { decision: "approved", comment: "Alignment has been reviewed" })
    await request("KAPRODI", "POST", `/api/curriculum-proposals/${proposal.id}/decision`, { decision: "implemented", comment: "Approved change implemented" })
    const [nextPeriod] = await db.insert(s.periods).values({ code: `NEXT-${suffix}`, name: "Next test period", startsOn: "2100-01-01", endsOn: "2100-06-30" }).returning()
    const [nextClass] = await db.insert(s.classSections).values({ curriculumCourseId: placement!.id, cohortId: cohort!.id, periodId: nextPeriod!.id, code: `NEXT-${suffix}`, name: "Next class", capacity: 3 }).returning()
    await request("ADMIN_PRODI", "POST", `/api/classes/${nextClass!.id}/teachers`, { profileId: actors.DOSEN_PENGAMPU!.profileId })
    const carried = (await request("DOSEN_PENGAMPU", "POST", `/api/classes/${nextClass!.id}/rps/carry-forward`, undefined, 201)).json()
    assert.equal(carried.status, "draft")
    const findings = (await request("GPM", "GET", "/api/cqi")).json(); const finding = findings.find((row: { classId: string }) => row.classId === id).finding
    const update = { analysis: "Temuan integration", actionPlan: "Remedial dan evaluasi metode", ownerProfileId: actors.DOSEN_PENGAMPU!.profileId, dueOn: "2099-06-01", status: "in_progress" }
    await request("DOSEN_PENGAMPU", "PATCH", `/api/cqi/${finding.id}`, update)
    const boundary = `proof-${suffix}`
    const proof = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="proof.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\nTest evidence\n%%EOF\r\n--${boundary}--\r\n`)
    const uploaded = await app.inject({ method: "POST", url: `/api/cqi/${finding.id}/attachments`, headers: { cookie: actors.DOSEN_PENGAMPU!.cookie, "content-type": `multipart/form-data; boundary=${boundary}` }, payload: proof })
    assert.equal(uploaded.statusCode, 200, uploaded.body)
    const attachmentId = uploaded.json().id
    const download = await request("GPM", "GET", `/api/attachments/${attachmentId}`)
    assert.match(download.headers["content-disposition"] as string, /attachment/)
    await request("OUTSIDER", "GET", `/api/attachments/${attachmentId}`, undefined, 403)
    await request("MAHASISWA", "GET", `/api/attachments/${attachmentId}`, undefined, 403)
    await request("", "GET", `/api/attachments/${attachmentId}`, undefined, 401)
    await request("DOSEN_PENGAMPU", "PATCH", `/api/cqi/${finding.id}`, { ...update, status: "pending_review" })
    // Remove the temporary reviewer role before checking ordinary lecturer permissions.
    await sqlClient`delete from user_role where profile_id=${actors.DOSEN_PENGAMPU!.profileId} and role_id=${gpmRole!.id}`
    await request("DOSEN_PENGAMPU", "PATCH", `/api/cqi/${finding.id}`, { ...update, status: "closed", comment: "Closed by owner" }, 403)
    await request("GPM", "PATCH", `/api/cqi/${finding.id}`, { ...update, status: "closed", comment: "Bukti sudah ditinjau" })
    await request("OUTSIDER", "GET", `/api/cqi/${finding.id}`, undefined, 403)
    const studentOutcomes = (await request("MAHASISWA", "GET", `/api/classes/${id}/outcomes`)).json()
    assert.equal(studentOutcomes.enrollments.length, 1); assert.ok(studentOutcomes.scores.every((row: { status: string }) => row.status === "released")); assert.equal(studentOutcomes.cqi.length, 0)
    await request("", "GET", `/api/attachments/${randomUUID()}`, undefined, 401)
    const catalog = (await request("SUPERADMIN", "GET", "/api/admin/database")).json()
    assert.ok(catalog.tables.length >= 35)
    await request("DOSEN_PENGAMPU", "GET", "/api/admin/database", undefined, 403)
    await request("", "GET", "/api/admin/database", undefined, 401)
    await request("SUPERADMIN", "GET", "/api/admin/database/not_a_table", undefined, 404)
    await request("SUPERADMIN", "GET", "/api/admin/database/program?sort=bad_column", undefined, 400)
    const authRows = (await request("SUPERADMIN", "GET", "/api/admin/database/auth_account")).json().rows
    assert.ok(authRows.every((row: Record<string, unknown>) => !("password" in row) && !("access_token" in row)))
    const record = (await request("SUPERADMIN", "GET", `/api/admin/database/program/${program!.id}`)).json()
    assert.ok(record.links.some((link: { target: string; count: number }) => link.target === "curriculum" && link.count > 0))
    await request("SUPERADMIN", "PATCH", `/api/admin/database/program/${program!.id}`, { revision: record.revision, changes: { name: "Updated integration program" } })
    await request("SUPERADMIN", "PATCH", `/api/admin/database/program/${program!.id}`, { revision: record.revision, changes: { name: "Stale" } }, 409)
    const fresh = (await request("SUPERADMIN", "GET", `/api/admin/database/program/${program!.id}`)).json()
    await request("SUPERADMIN", "DELETE", `/api/admin/database/program/${program!.id}`, { revision: fresh.revision }, 409)
    await request("SUPERADMIN", "PATCH", `/api/admin/database/program/${program!.id}`, { revision: fresh.revision, changes: { id: "bad" } }, 400)
    const disposable = (await db.insert(s.programs).values({ code: `DEL-${suffix}`, name: "Delete fixture", faculty: "Test" }).returning())[0]!
    const deleteRecord = (await request("SUPERADMIN", "GET", `/api/admin/database/program/${disposable.id}`)).json()
    await request("SUPERADMIN", "DELETE", `/api/admin/database/program/${disposable.id}`, { revision: deleteRecord.revision })
    await request("SUPERADMIN", "GET", `/api/admin/database/program/${disposable.id}`, undefined, 404)
    const fullDemo = (await request("SUPERADMIN", "POST", "/api/admin/demo/full", {})).json()
    assert.equal(fullDemo.classes, 12)
    const fullScenario = (await request("SUPERADMIN", "GET", "/api/admin/studio")).json().scenarios.find((item: { key: string; status: string }) => item.key === "full-academic" && item.status === "active")
    assert.equal(fullScenario.manifest.scores.length, 576)
    assert.equal(fullScenario.manifest.calculationRuns.length, 8)
    assert.ok(fullScenario.manifest.achievements.length > 0)
    assert.equal((await request("SUPERADMIN", "POST", "/api/admin/demo/full", {})).json().existing, true)
    await request("SUPERADMIN", "DELETE", `/api/admin/demo-scenarios/${fullScenario.id}`)
    await request("SUPERADMIN", "GET", `/api/admin/database/class_section/${fullScenario.manifest.classSections[0]}`, undefined, 404)
    const studio = (await request("SUPERADMIN", "GET", "/api/admin/studio")).json()
    assert.equal(studio.database.connected, true); assert.ok(studio.database.tables.length > 10)
    await request("ADMIN_PRODI", "GET", "/api/admin/studio", undefined, 403)
    const managedUserEmail = `managed-${suffix}@test.local`
    const managed = (await request("SUPERADMIN", "POST", "/api/admin/users", { name: "Managed Test User", email: managedUserEmail, password: `Managed-${suffix}!`, staffOrStudentId: `M-${suffix}`, roles: [{ roleCode: "GPM", programId: program!.id }] }, 201)).json()
    await request("SUPERADMIN", "PATCH", `/api/admin/users/${managed.id}`, { name: "Managed Test User Updated", email: managedUserEmail, staffOrStudentId: `M-${suffix}`, status: "active", banned: false })
    await request("SUPERADMIN", "PUT", `/api/admin/users/${managed.id}/roles`, { roles: [{ roleCode: "KAPRODI", programId: program!.id }] })
    await request("SUPERADMIN", "POST", "/api/admin/demo-scenarios", { key: "cqi-gap" }, 201)
    const scenario = (await request("SUPERADMIN", "GET", "/api/admin/studio")).json().scenarios.find((item: { key: string; status: string }) => item.key === "cqi-gap" && item.status === "active")
    assert.ok(scenario)
    await request("SUPERADMIN", "DELETE", `/api/admin/demo-scenarios/${scenario.id}`)
    const [lecturerAuthUser] = await db.select({ id: s.user.id }).from(s.user).innerJoin(s.profiles, eq(s.profiles.userId, s.user.id)).where(eq(s.profiles.id, actors.DOSEN_PENGAMPU!.profileId))
    const impersonated = await request("SUPERADMIN", "POST", "/api/auth/admin/impersonate-user", { userId: lecturerAuthUser!.id }, 200, { "x-impersonation-reason": "Verify lecturer access" })
    const impersonatedCookies = new Map(impersonated.cookies.map(cookie => [cookie.name, cookie.value]))
    const impersonatedCookie = [...impersonatedCookies].map(([name, value]) => `${name}=${value}`).join("; ")
    const impersonatedMe = await app.inject({ method: "GET", url: "/api/me", headers: { cookie: impersonatedCookie } })
    assert.equal(impersonatedMe.statusCode, 200, `impersonation cookies=${JSON.stringify(impersonated.cookies)} body=${impersonatedMe.body}`); assert.equal(impersonatedMe.json().user.id, lecturerAuthUser!.id); assert.equal(impersonatedMe.json().impersonation.impersonatedByName, `Test SUPERADMIN`)
    const stopped = await app.inject({ method: "POST", url: "/api/auth/admin/stop-impersonating", headers: { cookie: impersonatedCookie, origin: env.clientOrigin } })
    assert.equal(stopped.statusCode, 200, stopped.body)
    const adminProdiUser = (await db.select({ id: s.user.id }).from(s.user).innerJoin(s.profiles, eq(s.profiles.userId, s.user.id)).where(eq(s.profiles.id, actors.ADMIN_PRODI!.profileId)))[0]!
    await request("SUPERADMIN", "POST", "/api/auth/admin/impersonate-user", { userId: adminProdiUser.id }, 403, { "x-impersonation-reason": "Should be denied" })
    await request("GPM", "POST", "/api/auth/sign-out")
    await request("GPM", "GET", "/api/platform", undefined, 401)
  } finally { await app.close(); await closeDatabase() }
})
