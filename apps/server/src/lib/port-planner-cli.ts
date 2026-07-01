import { resolvePortPlan, applyPortPlanToProcessEnv } from './port-planner'

async function main() {
  const plan = await resolvePortPlan()
  if (!plan) {
    process.exit(2)
  }
  applyPortPlanToProcessEnv(plan)
  process.stdout.write(`${JSON.stringify(plan)}\n`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(2)
})
