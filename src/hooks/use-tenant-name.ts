import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useTenantName(tenantId: string | null) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setName(data.name);
      });
  }, [tenantId]);

  return name;
}
