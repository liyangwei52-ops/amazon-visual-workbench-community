import { VisualSuite } from "@/components/visual-suite"
import { Suspense } from "react"

export default function SuitePage() {
  return <Suspense fallback={null}><VisualSuite /></Suspense>
}
