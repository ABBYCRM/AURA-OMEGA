import { AppLayout } from "@/components/layout/AppLayout";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { useGetAuthStatus, getGetAuthStatusQueryKey } from "@workspace/api-client-react";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import ChatPage from "@/pages/chat";
import Dashboard from "@/pages/dashboard";
import HermesPage from "@/pages/hermes";
import ToolMatrixPage from "@/pages/tool-matrix";
import IntegrationsConsole from "@/pages/integrations-console";
import RuntimesPage from "@/pages/runtimes";
import ScheduledConsole from "@/pages/scheduled-console";
import Agents from "@/pages/agents";
import Tasks from "@/pages/tasks";
import Settings from "@/pages/settings";
import ScratchpadPage from "@/pages/scratchpad";
import CronPage from "@/pages/cron";
import RemotePage from "@/pages/remote";
import MissionsPage from "@/pages/missions";
import ReferencePage from "@/pages/reference";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        {/* Default lands on Chat — the command surface. */}
        <Route path="/" component={() => <Redirect to="/chat" />} />
        <Route path="/chat" component={ChatPage} />
        {/* Hermes overview — the new "home" panel. */}
        <Route path="/hermes" component={HermesPage} />
        {/* Legacy routes kept for backward compatibility. */}
        <Route path="/swarm" component={Dashboard} />
        <Route path="/agents" component={Agents} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/scheduled" component={ScheduledConsole} />
        <Route path="/cron" component={CronPage} />
        <Route path="/tools" component={ToolMatrixPage} />
        <Route path="/runtimes" component={RuntimesPage} />
        <Route path="/integrations" component={IntegrationsConsole} />
        <Route path="/settings" component={Settings} />
        <Route path="/scratchpad" component={ScratchpadPage} />
        <Route path="/remote" component={RemotePage} />
        <Route path="/missions" component={MissionsPage} />
        <Route path="/reference" component={ReferencePage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function AuthGate() {
  const { data, isLoading, refetch } = useGetAuthStatus({
    query: { retry: false, queryKey: getGetAuthStatusQueryKey() },
  });

  if (data?.authenticated) {
    return (
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <LoginPage onAuthenticated={() => refetch()} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthGate />
        <Toaster />
        <SonnerToaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;