import { useDroppable } from "@dnd-kit/core";
import { TaskCard } from "./TaskCard";
import type { BoardTask } from "@/pages/app/BoardPage";
import { columns } from "@/pages/app/BoardPage";

interface KanbanColumnProps {
  column: (typeof columns)[number];
  tasks: BoardTask[];
  canDragAny: boolean;
  currentUserId?: string;
  onTaskClick?: (task: BoardTask) => void;
}

export function KanbanColumn({
  column,
  tasks,
  canDragAny,
  currentUserId,
  onTaskClick,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`min-w-[250px] flex-1 flex flex-col rounded-lg transition-colors ${
        isOver ? "bg-muted/40" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div
          className="w-1 h-5 rounded-full shrink-0"
          style={{ backgroundColor: `hsl(${column.color})` }}
        />
        <h3 className="text-sm font-semibold text-foreground">{column.label}</h3>
        <span className="text-xs text-muted-foreground font-mono ml-auto">
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-2.5 flex-1 min-h-[120px]">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            canDrag={canDragAny || task.owner_user_id === currentUserId}
            onClick={onTaskClick}
          />
        ))}
        {tasks.length === 0 && (
          <div className="border border-dashed border-border rounded-lg h-20 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Nessun task</p>
          </div>
        )}
      </div>
    </div>
  );
}
