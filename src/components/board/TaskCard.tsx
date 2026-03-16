import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Sparkles, FileText, Link2, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BoardTask } from "@/pages/app/BoardPage";
import { ownerColor } from "@/pages/app/BoardPage";

const deadlineLabels: Record<string, string> = {
  next_meeting: "Prossima riunione",
  end_quarter: "Fine quarter",
  next_quarter: "Quarter successivo",
  custom: "Personalizzata",
};

const deadlineColors: Record<string, string> = {
  next_meeting: "bg-blue-50 text-blue-700 border-blue-200",
  end_quarter: "bg-purple-50 text-purple-700 border-purple-200",
  next_quarter: "bg-orange-50 text-orange-700 border-orange-200",
  custom: "bg-gray-50 text-gray-700 border-gray-200",
};

interface TaskCardProps {
  task: BoardTask;
  canDrag?: boolean;
  isDragging?: boolean;
  onClick?: (task: BoardTask) => void;
}

export function TaskCard({ task, canDrag = false, isDragging = false, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
    disabled: !canDrag,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 50 }
    : undefined;

  const initials = task.owner_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const dlColor = deadlineColors[task.deadline_type] ?? deadlineColors.custom;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
      className={`bg-background border border-border rounded-lg p-3.5 space-y-2.5 transition-shadow cursor-pointer ${
        canDrag ? "active:cursor-grabbing" : ""
      } ${isDragging ? "shadow-lg opacity-90 rotate-1" : "hover:shadow-sm"}`}
      onClick={() => onClick?.(task)}
    >
      {/* Title */}
      <p className="text-sm font-medium text-foreground leading-snug">{task.title}</p>

      {/* Owner */}
      <div className="flex items-center gap-2">
        <div
          className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
          style={{
            backgroundColor: ownerColor(task.owner_user_id),
            color: "white",
          }}
        >
          {initials}
        </div>
        <span className="text-xs text-muted-foreground truncate">{task.owner_name}</span>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Deadline */}
        <Badge variant="outline" className={`inline-flex items-center text-[10px] font-normal gap-1 py-0 ${dlColor}`}>
          <CalendarDays className="h-2.5 w-2.5" />
          {deadlineLabels[task.deadline_type] ?? task.deadline_type}
        </Badge>

        {/* Source */}
        {task.source === "ai_suggested" ? (
          <Sparkles className="h-3 w-3 text-muted-foreground" />
        ) : (
          <FileText className="h-3 w-3 text-muted-foreground" />
        )}

        {/* KPI link */}
        {task.kpi_name && (
          <Badge variant="secondary" className="inline-flex items-center text-[10px] font-normal gap-1 py-0">
            <Link2 className="h-2.5 w-2.5" />
            {task.kpi_name}
          </Badge>
        )}
      </div>
    </div>
  );
}
