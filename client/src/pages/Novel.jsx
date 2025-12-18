import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNovelStore } from '../store/novelStore';
import { 
  ArrowLeft, Download, FileText, CheckCircle, 
  PlayCircle, Pencil, Save, X, Loader2 
} from 'lucide-react';
import LogViewer from '../components/LogViewer';
import ChapterList from '../components/ChapterList';

const Novel = () => {
  const navigate = useNavigate();
  const store = useNovelStore();
  const { 
    novelMetadata, 
    chapters, 
    status, 
    fetchChapters, 
    startGeneration, 
    progress, 
    reset,
    updateMetadata
  } = store;

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    author: '',
    description: '',
    cover: ''
  });

  useEffect(() => {
    if (!novelMetadata) {
      navigate('/');
    } else {
      setEditForm({
        title: novelMetadata.title || '',
        author: novelMetadata.author || '',
        description: novelMetadata.description || '',
        cover: novelMetadata.cover || ''
      });
    }
  }, [novelMetadata, navigate]);

  if (!novelMetadata) return null;

  // Safe access to chapters in case store hasn't initialized it
  const safeChapters = chapters || [];
  const downloadedCount = safeChapters.filter(c => c.status === 'success').length;
  const totalChapters = safeChapters.length;

  const handleBack = () => {
    if (window.confirm('Go back? Current progress will be lost.')) {
      reset();
      navigate('/');
    }
  };

  const handleSaveEdit = () => {
    updateMetadata(editForm);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditForm({
      title: novelMetadata.title || '',
      author: novelMetadata.author || '',
      description: novelMetadata.description || '',
      cover: novelMetadata.cover || ''
    });
    setIsEditing(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="novel-container">
      {/* Header */}
      <div className="header-section">
        <button 
          onClick={handleBack}
          className="back-button"
        >
          <ArrowLeft size={16} /> Back to Search
        </button>

        {/* Novel Info Card */}
        <div className="info-card">
          
          {/* Left Column: Cover */}
          <div className="cover-column">
            {editForm.cover ? (
              <img 
                src={editForm.cover} 
                alt="Cover" 
                className="cover-image"
                onError={(e) => { e.target.src = 'https://via.placeholder.com/160x240?text=Error'; }}
              />
            ) : (
              <div className="cover-placeholder">
                No Cover
              </div>
            )}
            
            {isEditing && (
              <input
                type="text"
                name="cover"
                value={editForm.cover}
                onChange={handleInputChange}
                placeholder="Cover URL..."
                className="cover-input"
              />
            )}
          </div>

          {/* Right Column: Info */}
          <div className="info-column">
            
            {/* Toolbar */}
            <div className="toolbar">
              {!isEditing ? (
                <button 
                  onClick={() => setIsEditing(true)}
                  disabled={status === 'FETCHING' || status === 'GENERATING'}
                  className={`edit-button ${status === 'FETCHING' || status === 'GENERATING' ? 'disabled' : ''}`}
                >
                  <Pencil size={16} /> Edit Metadata
                </button>
              ) : (
                <div className="edit-actions">
                  <button 
                    onClick={handleCancelEdit}
                    className="cancel-button"
                  >
                    <X size={16} /> Cancel
                  </button>
                  <button 
                    onClick={handleSaveEdit}
                    className="save-button"
                  >
                    <Save size={16} /> Save
                  </button>
                </div>
              )}
            </div>

            {/* Fields */}
            <div className="fields-container">
              {isEditing ? (
                <div className="edit-fields">
                  <div>
                    <label className="field-label">Title</label>
                    <input
                      type="text"
                      name="title"
                      value={editForm.title}
                      onChange={handleInputChange}
                      className="title-input"
                    />
                  </div>
                  <div>
                    <label className="field-label">Author</label>
                    <input
                      type="text"
                      name="author"
                      value={editForm.author}
                      onChange={handleInputChange}
                      className="author-input"
                    />
                  </div>
                  <div>
                    <label className="field-label">Description</label>
                    <textarea
                      name="description"
                      value={editForm.description}
                      onChange={handleInputChange}
                      rows={6}
                      className="description-input"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="novel-title">{novelMetadata.title}</h1>
                  <p className="novel-author">
                    by <strong>{novelMetadata.author}</strong>
                  </p>
                  
                  <div className="novel-stats">
                    <div className="stat-item">
                      <FileText size={18} />
                      <span>{totalChapters} Chapters</span>
                    </div>
                    {status === 'COMPLETED' && (
                      <div className="stat-item success">
                        <CheckCircle size={18} />
                        <span>Ready to Download</span>
                      </div>
                    )}
                  </div>

                  <div className="novel-description">
                    {novelMetadata.description || 'No description available.'}
                  </div>
                </>
              )}
            </div>

            {/* Main Actions */}
            {!isEditing && (
              <div className="action-buttons">
                {(status === 'READY' || status === 'PAUSED' || status === 'ERROR' || status === 'FETCHING') && (
                  <button 
                    onClick={fetchChapters}
                    disabled={status === 'FETCHING'}
                    className={`fetch-button ${status === 'FETCHING' ? 'fetching' : ''}`}
                  >
                    {status === 'FETCHING' ? <><Loader2 size={18} className="spin" /> Fetching...</> : <><PlayCircle size={18} /> {downloadedCount > 0 ? 'Resume Download' : 'Start Download'}</>}
                  </button>
                )}

                {(status === 'COMPLETED' || (status === 'READY' && downloadedCount > 0)) && (
                  <button 
                    onClick={startGeneration}
                    disabled={status === 'GENERATING'}
                    className="generate-button"
                  >
                    <Download size={18} /> 
                    {status === 'GENERATING' ? 'Building EPUB...' : 'Generate EPUB'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="progress-card">
          <div className="progress-header">
            <span>Progress</span>
            <span>{progress}% ({downloadedCount} / {totalChapters})</span>
          </div>
          <div className="progress-track">
            <div 
              className={`progress-fill ${status === 'ERROR' ? 'error' : ''}`}
              style={{ width: `${progress}%` }} 
            />
          </div>
        </div>
      </div>

      {/* Main Content Area: Split View (Chapters & Logs) */}
      <div className="main-content">
        {/* Chapter List Section */}
        <div className="content-panel">
          <ChapterList />
        </div>

        {/* Logs Section */}
        <div className="content-panel">
           <LogViewer />
        </div>
      </div>

      <style>{`
        .novel-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
          height: 100vh;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }

        .header-section {
          flex-shrink: 0;
        }

        .back-button {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          margin-bottom: 20px;
          font-size: 14px;
          padding: 0;
        }

        .info-card {
          background: white;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: row;
          gap: 30px;
          margin-bottom: 24px;
        }

        .cover-column {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 160px;
          flex-shrink: 0;
        }

        .cover-image, .cover-placeholder {
          width: 160px;
          height: 240px;
          border-radius: 8px;
        }

        .cover-image {
          object-fit: cover;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          background: #f1f5f9;
        }

        .cover-placeholder {
          background: #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
        }

        .cover-input {
          width: 100%;
          padding: 6px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 12px;
          box-sizing: border-box;
        }

        .info-column {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .toolbar {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 10px;
        }

        .edit-button {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 14px;
        }

        .edit-button.disabled {
          opacity: 0.5;
        }

        .edit-actions {
          display: flex;
          gap: 10px;
        }

        .cancel-button {
          background: none;
          border: 1px solid #cbd5e1;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 14px;
          padding: 4px 12px;
          border-radius: 6px;
        }

        .save-button {
          background: #22c55e;
          border: none;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 14px;
          padding: 4px 12px;
          border-radius: 6px;
        }

        .fields-container {
          flex: 1;
          overflow-y: auto;
        }

        .edit-fields {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .field-label {
          display: block;
          font-size: 12px;
          color: #64748b;
          margin-bottom: 4px;
        }

        .title-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 1.5rem;
          font-weight: bold;
          color: #1e293b;
          box-sizing: border-box;
        }

        .author-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 1.1rem;
          color: #334155;
          box-sizing: border-box;
        }

        .description-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 1rem;
          color: #475569;
          font-family: inherit;
          resize: vertical;
          box-sizing: border-box;
        }

        .novel-title {
          margin: 0 0 10px 0;
          font-size: 2rem;
          color: #1e293b;
        }

        .novel-author {
          margin: 0 0 15px 0;
          color: #64748b;
          font-size: 1.1rem;
        }

        .novel-author strong {
          color: #334155;
        }

        .novel-stats {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
          font-size: 0.9rem;
          color: #475569;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .stat-item.success {
          color: #16a34a;
        }

        .novel-description {
          line-height: 1.6;
          color: #475569;
          position: relative;
          margin-bottom: 20px;
          white-space: pre-wrap;
          max-height: 150px;
          overflow-y: auto;
        }

        .action-buttons {
          display: flex;
          gap: 15px;
          align-items: center;
          margin-top: auto;
          padding-top: 20px;
        }

        .fetch-button {
          background: #2563eb;
          color: white;
          border: none;
          padding: 10px 24px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background 0.2s;
        }

        .fetch-button.fetching {
          background: #94a3b8;
          cursor: not-allowed;
        }

        .generate-button {
          background: #7c3aed;
          color: white;
          border: none;
          padding: 10px 24px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .progress-card {
          background: white;
          padding: 16px;
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
          margin-bottom: 24px;
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
          font-weight: 500;
        }

        .progress-track {
          width: 100%;
          height: 12px;
          background: #f1f5f9;
          border-radius: 6px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: #22c55e;
          transition: width 0.3s ease;
        }

        .progress-fill.error {
          background: #ef4444;
        }

        .main-content {
          display: flex;
          gap: 24px;
          flex: 1;
          min-height: 0;
        }

        .content-panel {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .novel-container {
            height: auto;
            min-height: 100vh;
            padding: 20px 16px;
          }
          .info-card {
            flex-direction: column;
            align-items: center;
          }
          .cover-column {
            width: 100%;
            align-items: center;
          }
          .info-column {
            width: 100%;
          }
          .action-buttons {
            flex-direction: column;
            width: 100%;
          }
          .fetch-button, .generate-button {
            width: 100%;
            justify-content: center;
          }
          .main-content {
            flex-direction: column;
            min-height: auto;
          }
          .content-panel {
            min-height: 400px; /* Give some height to logs/list on mobile */
          }
        }

        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Novel;