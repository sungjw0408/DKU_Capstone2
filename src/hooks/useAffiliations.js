import { useEffect, useState } from "react";
import { listAffiliations } from "../services/profileApi";

export default function useAffiliations(enabled = true) {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    setError("");
    listAffiliations().then((result) => { if (active) setCatalog(result); })
      .catch((failure) => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, enabled]);
  return { catalog, loading, error, retry: () => setAttempt((value) => value + 1) };
}
