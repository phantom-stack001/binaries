import { RouterProvider } from "react-router-dom";

import { router } from "@/app/router";
import { DeploymentUpdatePrompt } from "@/components/layout/DeploymentUpdatePrompt";
import { TooltipProvider } from "@/components/ui/tooltip";

export function App() {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
      <DeploymentUpdatePrompt />
    </TooltipProvider>
  );
}
