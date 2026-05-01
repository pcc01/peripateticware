import React, { useState } from 'react';
import { Grid, List, Award } from 'lucide-react';
import { EvidenceCollection } from '../../types/student';
import { usePortfolioStore } from '../../stores/student';

interface EvidencePortfolioProps {
  studentId: string;
}

const EvidencePortfolio: React.FC<EvidencePortfolioProps> = ({ studentId }) => {
  const [viewMode, setViewMode] = useState<'gallery' | 'timeline' | 'collections'>('gallery');
  const { collections, loading, error } = usePortfolioStore();

  React.useEffect(() => {
    usePortfolioStore.getState().fetchCollections(studentId);
  }, [studentId]);

  const renderGalleryView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {collections.map(collection => (
        <div key={collection.id} className="border rounded-lg p-4 bg-white hover:shadow-lg transition">
          <h4 className="font-semibold mb-2">{collection.title}</h4>
          <p className="text-sm text-gray-600 mb-3">{collection.description}</p>
          <div className="flex gap-2 flex-wrap">
            {collection.competencies_demonstrated.map(comp => (
              <span key={comp} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                {comp}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderTimelineView = () => (
    <div className="space-y-4">
      {collections.map(collection => (
        <div key={collection.id} className="flex gap-4 pb-4 border-l-2 border-blue-500 pl-4">
          <div className="text-sm font-medium">{new Date(collection.created_at).toLocaleDateString()}</div>
          <div className="flex-1">
            <h4 className="font-semibold">{collection.title}</h4>
            <p className="text-gray-600 text-sm">{collection.description}</p>
          </div>
        </div>
      ))}
    </div>
  );

  const renderCollectionsView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {collections.map(collection => (
        <div key={collection.id} className="border rounded-lg p-6 bg-white">
          <Award className="w-8 h-8 text-blue-600 mb-2" />
          <h3 className="text-lg font-semibold mb-2">{collection.title}</h3>
          <p className="text-gray-600 text-sm mb-4">{collection.description}</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-600">Items:</span>
              <p className="font-semibold">{collection.captures.length + collection.entries.length}</p>
            </div>
            <div>
              <span className="text-gray-600">Status:</span>
              <p className="font-semibold capitalize">{collection.status}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  if (loading) return <div className="p-4 text-center">Loading portfolio...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Evidence Portfolio</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('gallery')}
            className={`p-2 rounded ${viewMode === 'gallery' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            <Grid className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`p-2 rounded ${viewMode === 'timeline' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            <List className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('collections')}
            className={`p-2 rounded ${viewMode === 'collections' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            <Award className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="mt-4">
        {viewMode === 'gallery' && renderGalleryView()}
        {viewMode === 'timeline' && renderTimelineView()}
        {viewMode === 'collections' && renderCollectionsView()}
      </div>
    </div>
  );
};

export default EvidencePortfolio;
