import { useProjectStore } from '@/stores/projectStore'

export function CollaborationWorkspace({ projectId }) {
  const { getProject, addContributor } = useProjectStore()
  const project = getProject(projectId)
  
  return (
    <div>
      {/* Collaboration interface */}
    </div>
  )
}