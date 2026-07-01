import { useState, type FormEvent } from "react";
import { BrainCircuit, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@workspace/api-client-react";

export default function LoginPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      // Runtime-verified shape (generated mutationFn unwraps props.data → login body).
      // Cast because the package's compiled types can lag the server contract.
      await login.mutateAsync({ data: { username, password } } as never);
      onAuthenticated();
    } catch {
      setError("Invalid username or password");
    }
  };

  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/25 mb-4">
            <BrainCircuit className="w-6 h-6 text-primary" />
          </div>
          <div className="text-lg font-black tracking-tight">AURA-OMEGA</div>
          <div className="text-xs text-muted-foreground font-medium">Sign in to continue</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              data-testid="input-username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="input-password"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={login.isPending || !username || !password}
            data-testid="button-login"
          >
            {login.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
