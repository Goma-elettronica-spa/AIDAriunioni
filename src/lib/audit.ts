import { supabase } from "@/integrations/supabase/client";

interface AuditEntry {
  tenantId: string;
  userId: string;
  action: "create" | "update" | "delete";
  entityType: string;
  entityId: string;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
  modifiedForUserId?: string | null;
}

export async function writeAuditLog(entry: AuditEntry) {
  try {
    await supabase.from("audit_logs").insert({
      tenant_id: entry.tenantId,
      user_id: entry.userId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      old_values: entry.oldValues ?? null,
      new_values: entry.newValues ?? null,
      modified_for_user_id: entry.modifiedForUserId ?? null,
    });
  } catch (e) {
    console.error("Audit log failed:", e);
    // Don't throw - audit logging should never break the main flow
  }
}
