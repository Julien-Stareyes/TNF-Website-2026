"use client";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Vertical sortable list. Each child gets a drag handle (⋮⋮) via
// `SortableItem`. On drop, `onReorder(newOrder)` fires with the new
// ordering of ids.
export function SortableList({ ids, onReorder, children }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const handleDragEnd = (e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

// One draggable row. Renders `renderContent({ dragHandle })` — the
// consumer places the handle wherever they want, and applies the rest of
// the layout freely.
export function SortableItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const dragHandle = (
    <button
      {...attributes}
      {...listeners}
      type="button"
      className="shrink-0 cursor-grab active:cursor-grabbing text-white/40 hover:text-white px-1 select-none"
      title="Drag to reorder"
    >
      ⋮⋮
    </button>
  );
  return (
    <div ref={setNodeRef} style={style}>
      {typeof children === "function" ? children({ dragHandle }) : children}
    </div>
  );
}
