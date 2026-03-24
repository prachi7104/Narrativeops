import { createBrowserRouter, Outlet } from "react-router";
import { Dashboard } from "./screens/Dashboard";
import { BriefConfiguration } from "./screens/BriefConfiguration";
import { PipelineRunning } from "./screens/PipelineRunning";
import { ApprovalGate } from "./screens/ApprovalGate";
import { AuditTrail } from "./screens/AuditTrail";
import { MyPipelines } from "./screens/MyPipelines";
import { Gallery } from "./screens/Gallery";
import { Settings } from "./screens/Settings";
import { AppLayout } from "./components/AppLayout";

function LayoutRoute() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

export const appRoutes = [
  {
    path: "/pipeline/:id",
    Component: PipelineRunning,
  },
  {
    path: "/",
    Component: LayoutRoute,
    children: [
      {
        index: true,
        Component: Dashboard,
      },
      {
        path: "configure",
        Component: BriefConfiguration,
      },
      {
        path: "approval/:id",
        Component: ApprovalGate,
      },
      {
        path: "audit/:id",
        Component: AuditTrail,
      },
      {
        path: "pipelines",
        Component: MyPipelines,
      },
      {
        path: "gallery",
        Component: Gallery,
      },
      {
        path: "settings",
        Component: Settings,
      },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
