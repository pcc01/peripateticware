import { useProjectStore } from '@/stores/projectStore'

export function ConflictResolutionModal({ projectId }) {
  const { getConflictingProjects, resolveConflict } = useProjectStore()
  
  return (
    <div>
      {/* Conflict resolution UI */}
    </div>
  )
}