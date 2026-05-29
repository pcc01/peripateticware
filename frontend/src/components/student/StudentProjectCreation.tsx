import { useState } from 'react'
import { useProjectStore } from '@/stores/projectStore'

export function StudentProjectCreation() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const { addProject } = useProjectStore()
  
  const handleCreate = () => {
    addProject({
      id: crypto.randomUUID(),
      name,
      description,
      contributors: [],
      status: 'draft',
      visibility: 'private',
      created_by: currentUser.id, // Get from auth
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      synced: false,
    })
  }
  
  return (
    <div>
      {/* Project creation form */}
    </div>
  )
}