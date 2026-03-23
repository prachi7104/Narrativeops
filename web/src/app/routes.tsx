import { createBrowserRouter } from "react-router";
import { Dashboard } from "./screens/Dashboard";
import { BriefConfiguration } from "./screens/BriefConfiguration";
import { PipelineRunning } from "./screens/PipelineRunning";
import { ApprovalGate } from "./screens/ApprovalGate";
import { AuditTrail } from "./screens/AuditTrail";
import { MyPipelines } from "./screens/MyPipelines";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Dashboard,
  },
  {
    path: "/configure",
    Component: BriefConfiguration,
  },
  {
    path: "/pipeline/:id",
    Component: PipelineRunning,
  },
  {
    path: "/approval/:id",
    Component: ApprovalGate,
  },
  {
    path: "/audit/:id",
    Component: AuditTrail,
  },
  {
    path: "/pipelines",
    Component: MyPipelines,
  },
]);
