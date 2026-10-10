/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Table as TableIcon, FileText, ChevronRight, Upload, Search, Trash2, Edit2, Check, X, Download, AlertCircle, Loader2, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, getDocs, where } from 'firebase/firestore';
import { db } from './lib/firebase';
import { extractIdentity } from './services/geminiService';

// Types
interface Batch {
  id: string;
  name: string;
  branchName?: string;
  driveUrl?: string;
  maxMarksPerQuestion?: number;
  questionCount?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: any;
  stats?: {
    total: number;
    completed: number;
    failed: number;
  };
}

interface Evaluation {
  id: string;
  batchId: string;
  studentName: string;
  phoneNumber: string;
  branch?: string;
  scores: Record<string, number>;
  totalScore: number;
  maxScore: number;
  feedback: string;
  imageUrls: string[];
  isEdited: boolean;
  status: 'processing' | 'success' | 'error';
  errorMessage?: string;
  createdAt: any;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'batches' | 'batch-detail'>('batches');
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isAddingBatch, setIsAddingBatch] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchUrl, setNewBatchUrl] = useState('');
  const [newBatchMaxMarks, setNewBatchMaxMarks] = useState(10);
  const [newBatchQuestionCount, setNewBatchQuestionCount] = useState(10);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [lastDeletedEvaluation, setLastDeletedEvaluation] = useState<any | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [undoTimer, setUndoTimer] = useState<any>(null);

  const formatTitleCase = (str: string) => {
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  // Real-time listener for batches
  useEffect(() => {
    const q = query(collection(db, 'batches'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const batchList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Batch));
      setBatches(batchList);
    });
    return () => unsubscribe();
  }, []);

  const createBatch = async () => {
    if (!newBatchName) return;
    await addDoc(collection(db, 'batches'), {
      name: newBatchName,
      driveUrl: newBatchUrl,
      maxMarksPerQuestion: newBatchMaxMarks,
      questionCount: newBatchQuestionCount,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      stats: { total: 0, completed: 0, failed: 0 }
    });
    setNewBatchName('');
    setNewBatchUrl('');
    setIsAddingBatch(false);
  };

  const deleteBatch = async (id: string) => {
    setProjectToDelete(null);
    try {
      const evalQuery = query(collection(db, 'evaluations'), where('batchId', '==', id));
      const evalDocs = await getDocs(evalQuery);
      
      const deletePromises = evalDocs.docs.map(d => deleteDoc(doc(db, 'evaluations', d.id)));
      await Promise.all(deletePromises);
      
      await deleteDoc(doc(db, 'batches', id));

      if (selectedBatchId === id) {
        setSelectedBatchId(null);
        setActiveTab('batches');
      }
    } catch (error) {
      console.error("Delete Error:", error);
    }
  };

  const deleteEvaluation = async (evaluation: Evaluation) => {
    setLastDeletedEvaluation(evaluation);
    setShowUndo(true);
    
    if (undoTimer) clearTimeout(undoTimer);
    
    await deleteDoc(doc(db, 'evaluations', evaluation.id));
    
    const timer = setTimeout(() => {
       setShowUndo(false);
       setLastDeletedEvaluation(null);
    }, 5000);
    setUndoTimer(timer);
  };

  const undoDelete = async () => {
    if (!lastDeletedEvaluation) return;
    if (undoTimer) clearTimeout(undoTimer);
    
    const { id: _id, ...data } = lastDeletedEvaluation;
    await addDoc(collection(db, 'evaluations'), {
      ...data,
      updatedAt: serverTimestamp()
    });
    
    setShowUndo(false);
    setLastDeletedEvaluation(null);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#E5E5E5] font-sans selection:bg-emerald-500/30">
      {/* Top Navigation */}
      <nav className="h-16 border-b border-[#222] px-6 flex items-center justify-between bg-[#0A0A0A] sticky top-0 z-40">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('batches')}>
          <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <FileText className="text-black w-5 h-5" />
          </div>
          <h1 className="text-sm font-black tracking-widest uppercase">ScriptEval AI</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest bg-zinc-900 px-2 py-1 rounded border border-zinc-800">v2.4.0-STABLE</span>
          <button 
            onClick={() => setIsAddingBatch(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded transition-all shadow-[0_4px_12px_rgba(16,185,129,0.2)] font-bold text-xs uppercase tracking-wider"
          >
            <Plus size={16} />
            <span>New Project</span>
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        <AnimatePresence mode="wait">
          {activeTab === 'batches' ? (
            <motion.div
              key="batches-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="flex flex-col gap-1">
                <h2 className="text-3xl font-bold tracking-tight">Recent Batches</h2>
                <p className="text-[#64748B] text-lg">Manage and monitor your script evaluation batches</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {batches.map(batch => (
                  <div key={batch.id}>
                    <BatchCard 
                      batch={batch} 
                      onClick={() => {
                        setSelectedBatchId(batch.id);
                        setActiveTab('batch-detail');
                      }}
                      onDelete={() => setProjectToDelete(batch.id)}
                    />
                  </div>
                ))}
                
                {batches.length === 0 && !isAddingBatch && (
                  <div className="col-span-full py-24 flex flex-col items-center justify-center border-2 border-dashed border-[#E2E8F0] rounded-3xl bg-white/50">
                    <Upload className="text-[#94A3B8] w-16 h-16 mb-4" />
                    <h3 className="text-xl font-bold">No batches yet</h3>
                    <p className="text-[#64748B] mb-8">Create your first batch to start evaluating scripts</p>
                    <button 
                      onClick={() => setIsAddingBatch(true)}
                      className="bg-white border border-[#E2E8F0] px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-[#F8FAFC] transition-all"
                    >
                      Start your first evaluation
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <BatchDetail 
              batchId={selectedBatchId!} 
              batchName={batches.find(b => b.id === selectedBatchId)?.name || 'Batch'}
              onBack={() => setActiveTab('batches')} 
              onDeleteBatch={() => setProjectToDelete(selectedBatchId)}
              onDeleteEvaluation={deleteEvaluation}
            />
          )}
        </AnimatePresence>
      </main>

      {/* New Batch Modal */}
      <AnimatePresence>
        {isAddingBatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-md"
              onClick={() => setIsAddingBatch(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#0A0A0A] rounded shadow-2xl w-full max-w-md overflow-hidden z-10 p-8 flex flex-col gap-8 border border-[#222]"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-light text-white tracking-tight">Create New Project</h3>
                <button onClick={() => setIsAddingBatch(false)} className="text-zinc-500 hover:text-white p-1 transition-all">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Project Title</label>
                  <input 
                    type="text" 
                    value={newBatchName}
                    onChange={(e) => setNewBatchName(e.target.value)}
                    placeholder="e.g. Final Exam 2024"
                    className="w-full bg-[#151515] border border-[#333] text-sm py-3 px-4 rounded focus:outline-none focus:border-emerald-500 text-white transition-all font-medium placeholder-zinc-600"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Cloud Storage URL</label>
                  <input 
                    type="text" 
                    value={newBatchUrl}
                    onChange={(e) => setNewBatchUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full bg-[#151515] border border-[#333] text-sm py-3 px-4 rounded focus:outline-none focus:border-emerald-500 text-white transition-all font-medium placeholder-zinc-600"
                  />
                  <p className="text-[10px] text-zinc-600 flex items-center gap-1.5 pt-1 uppercase tracking-wider font-bold">
                    <AlertCircle size={12} /> External reference
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Max Marks / Q</label>
                    <input 
                      type="number" 
                      value={newBatchMaxMarks}
                      onChange={(e) => setNewBatchMaxMarks(parseInt(e.target.value) || 10)}
                      className="w-full bg-[#151515] border border-[#333] text-sm py-3 px-4 rounded focus:outline-none focus:border-emerald-500 text-white transition-all font-medium placeholder-zinc-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">No. of Questions</label>
                    <input 
                      type="number" 
                      value={newBatchQuestionCount}
                      onChange={(e) => setNewBatchQuestionCount(parseInt(e.target.value) || 10)}
                      className="w-full bg-[#151515] border border-[#333] text-sm py-3 px-4 rounded focus:outline-none focus:border-emerald-500 text-white transition-all font-medium placeholder-zinc-600"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 font-mono">
                <button 
                  onClick={() => setIsAddingBatch(false)}
                  className="flex-1 px-6 py-3 border border-[#333] bg-zinc-900 text-zinc-400 rounded text-xs font-bold hover:bg-zinc-800 transition-all uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button 
                  onClick={createBatch}
                  className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-500 transition-all shadow-[0_4px_12px_rgba(16,185,129,0.2)] uppercase tracking-widest"
                >
                  Create Project
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {projectToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setProjectToDelete(null)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#0A0A0A] border border-red-900/30 p-8 rounded-lg max-w-sm w-full z-10 space-y-6 text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mx-auto">
                <AlertCircle size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">Delete Project?</h3>
                <p className="text-zinc-500 text-sm">This will permanently remove all evaluations and project data. This action cannot be undone.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setProjectToDelete(null)}
                  className="flex-1 px-4 py-3 bg-zinc-900 text-zinc-400 rounded font-bold text-xs uppercase tracking-widest hover:bg-zinc-800 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => deleteBatch(projectToDelete)}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded font-bold text-xs uppercase tracking-widest hover:bg-red-500 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Undo Notification */}
      <AnimatePresence>
        {showUndo && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-[#1a1a1a] border border-[#333] px-6 py-4 rounded-full shadow-2xl flex items-center gap-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-white">Entry deleted successfully</span>
            </div>
            <button 
              onClick={undoDelete}
              className="text-emerald-500 text-xs font-black uppercase tracking-[0.2em] hover:text-emerald-400 transition-all flex items-center gap-2"
            >
              <ArrowUpDown size={12} className="rotate-90" />
              Undo Changes
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BatchCard({ batch, onClick, onDelete }: { batch: Batch, onClick: () => void, onDelete: () => void | Promise<void> }) {
  return (
    <motion.div 
      whileHover={{ y: -4, scale: 1.01 }}
      className="bg-[#0A0A0A] border border-[#222] rounded overflow-hidden shadow-lg hover:shadow-emerald-500/5 transition-all cursor-pointer flex flex-col group"
      onClick={onClick}
    >
      <div className="p-6 flex-1">
        <div className="flex justify-between items-start mb-6">
          <div className="w-10 h-10 bg-emerald-500/10 rounded flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <TableIcon size={20} />
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-zinc-700 hover:text-red-500 p-2 rounded transition-all hover:bg-red-500/10"
          >
            <Trash2 size={16} />
          </button>
        </div>
        <h3 className="text-lg font-medium text-white mb-1 group-hover:text-emerald-500 transition-colors truncate">{batch.name}</h3>
        <div className="flex items-center gap-2 mb-4">
          <p className="text-zinc-600 text-[10px] font-mono uppercase tracking-widest">
            {batch.createdAt?.toDate ? batch.createdAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pending'}
          </p>
        </div>
        
        <div className="space-y-3">
          <div className="flex justify-between text-[9px] font-bold uppercase tracking-[0.2em]">
            <span className="text-zinc-500">Progress</span>
            <span className="text-emerald-500">{batch.stats?.completed || 0} / {batch.stats?.total || 0}</span>
          </div>
          <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden border border-zinc-800">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${batch.stats?.total ? (batch.stats.completed / batch.stats.total) * 100 : 0}%` }}
              className="bg-emerald-500 h-full rounded-full" 
            />
          </div>
        </div>
      </div>
      <div className="px-6 py-4 bg-[#0D0D0D] border-t border-[#181818] flex items-center justify-between group-hover:bg-[#151515] transition-colors">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 group-hover:text-emerald-500">Inspect Results</span>
        <div className="text-zinc-700 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all">
          <ChevronRight size={14} />
        </div>
      </div>
    </motion.div>
  );
}

function BatchDetail({ batchId, batchName, onBack, onDeleteBatch, onDeleteEvaluation }: { batchId: string, batchName: string, onBack: () => void, onDeleteBatch: () => void, onDeleteEvaluation: (e: Evaluation) => Promise<void> }) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [batchMaxMarks, setBatchMaxMarks] = useState(10);
  const [batchQuestionCount, setBatchQuestionCount] = useState(10);
  const [uploadBranch, setUploadBranch] = useState('');
  
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'evaluations'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Evaluation))
        .filter(e => e.batchId === batchId);
      setEvaluations(list);
    });

    // Get current project settings
    const fetchBatch = async () => {
      const snap = await getDocs(query(collection(db, 'batches'))); // still named 'batches' in DB for compatibility
      const b = snap.docs.find(d => d.id === batchId);
      if (b) {
        const data = b.data();
        if (data.maxMarksPerQuestion) setBatchMaxMarks(data.maxMarksPerQuestion);
        if (data.questionCount) setBatchQuestionCount(data.questionCount);
      }
    };
    fetchBatch();

    return () => unsubscribe();
  }, [batchId]);

  const sortedEvaluations = React.useMemo(() => {
    if (!sortConfig) return evaluations;
    
    return [...evaluations].sort((a, b) => {
      let aValue: any = (a as any)[sortConfig.key];
      let bValue: any = (b as any)[sortConfig.key];
      
      if (sortConfig.key.startsWith('Q')) {
        aValue = a.scores[sortConfig.key] || 0;
        bValue = b.scores[sortConfig.key] || 0;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      
      // Secondary sort for Branch: by Total Score Desc
      if (sortConfig.key === 'branch') {
        return b.totalScore - a.totalScore;
      }
      return 0;
    });
  }, [evaluations, sortConfig]);

  const rankingInfo = React.useMemo(() => {
    // 1. Calculate Global Ranks (Score Desc)
    const sortedGlobal = [...evaluations].sort((a, b) => b.totalScore - a.totalScore);
    const globalRanks: Record<string, number> = {};
    let gRank = 1;
    sortedGlobal.forEach((e, i) => {
      if (i > 0 && e.totalScore < sortedGlobal[i - 1].totalScore) gRank = i + 1;
      globalRanks[e.id] = gRank;
    });

    // 2. Calculate Branch Ranks
    const branchRanks: Record<string, number> = {};
    const grouped = evaluations.reduce((acc, curr) => {
      const b = curr.branch || 'Unknown';
      if (!acc[b]) acc[b] = [];
      acc[b].push(curr);
      return acc;
    }, {} as Record<string, Evaluation[]>);

    Object.keys(grouped).forEach(branch => {
      const sortedBranch = grouped[branch].sort((a, b) => b.totalScore - a.totalScore);
      let bRank = 1;
      sortedBranch.forEach((e, i) => {
        if (i > 0 && e.totalScore < sortedBranch[i - 1].totalScore) bRank = i + 1;
        branchRanks[e.id] = bRank;
      });
    });

    return { globalRanks, branchRanks };
  }, [evaluations]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!uploadBranch) {
      alert("Please enter a Branch Name before uploading.");
      event.target.value = '';
      return;
    }
    const uploadedFiles: File[] = Array.from(event.target.files || []);
    if (uploadedFiles.length === 0) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    
    const batchRef = doc(db, 'batches', batchId);
    
    // Process files in parallel for maximum speed
    const processFile = async (file: File, _index: number) => {
        try {
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.readAsDataURL(file);
            });
                
            const result = await extractIdentity(base64, file.type || "image/jpeg", file.name);

            await addDoc(collection(db, 'evaluations'), {
              batchId,
              studentName: result.studentName || 'Unknown',
              phoneNumber: result.phoneNumber || 'Unknown',
              branch: uploadBranch,
              scores: {},
              totalScore: 0,
              maxScore: 100,
              feedback: 'Awaiting manual scoring...',
              imageUrls: [], 
              status: 'success',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });

        } catch (error: any) {
            console.error("Processing Error:", error);
            await addDoc(collection(db, 'evaluations'), {
              batchId,
              studentName: 'Extraction Failed',
              phoneNumber: 'Error',
              scores: {},
              totalScore: 0,
              status: 'error',
              errorMessage: error.message || 'Failed to read script',
              createdAt: serverTimestamp()
            });
        }
        
        setUploadProgress(prev => prev + (100 / uploadedFiles.length));
    };

    // Trigger all in parallel
    await Promise.all(uploadedFiles.map((file, i) => processFile(file, i)));

    // Update batch stats once at the end
    const finalEvaluations = await getDocs(query(collection(db, 'evaluations'), where('batchId', '==', batchId)));
    await updateDoc(batchRef, { 
      'stats.total': finalEvaluations.size,
      'stats.completed': finalEvaluations.docs.filter(d => d.data().status === 'success').length
    });
    
    setIsUploading(false);
  };

  const exportToCSV = () => {
    const headers = ['Name', 'Phone', ...Array.from({length: batchQuestionCount}, (_, i) => `Q${i+1}`), 'Total'];
    const rows = evaluations.map(e => [
      e.studentName,
      e.phoneNumber,
      ...Array.from({length: batchQuestionCount}, (_, i) => e.scores[`Q${i+1}`] || 0),
      e.totalScore
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers, ...rows].map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${batchName.replace(/\s+/g, '_')}_results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="space-y-1">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-zinc-500 hover:text-emerald-500 transition-all font-bold text-[10px] uppercase tracking-[0.2em] mb-2"
          >
            <ChevronRight className="rotate-180" size={14} />
            <span>Project Index</span>
          </button>
          <h2 className="text-3xl font-light text-white tracking-tight">{batchName}</h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs text-zinc-500 font-mono">AI-powered script analysis & scoring</p>
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-[10px] text-zinc-400">
               <span className="uppercase font-bold tracking-widest text-[9px]">Max:</span>
               <input 
                 type="number" 
                 value={batchMaxMarks} 
                 onChange={async (e) => {
                   const val = parseInt(e.target.value) || 10;
                   setBatchMaxMarks(val);
                   await updateDoc(doc(db, 'batches', batchId), { maxMarksPerQuestion: val });
                 }}
                 className="w-8 bg-transparent text-emerald-500 font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
               />
            </div>
            <button 
              onClick={onDeleteBatch}
              className="text-[9px] font-bold text-red-500/50 hover:text-red-500 uppercase tracking-widest ml-4 transition-all"
            >
              Delete Project
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest pl-1">Batch Branch</label>
            <input 
              type="text" 
              value={uploadBranch}
              onChange={(e) => setUploadBranch(e.target.value)}
              placeholder="e.g. Motijheel"
              className="bg-[#1A1A1A] border border-[#333] px-3 py-2 rounded text-[11px] text-zinc-300 outline-none focus:border-emerald-500 w-32 placeholder-zinc-700"
            />
          </div>
          <button 
            disabled={!uploadBranch}
            onClick={() => setIsAddingManual(true)}
            className={`flex items-center gap-2 border border-[#333] px-4 py-2.5 rounded text-xs transition-all font-bold uppercase tracking-wider self-end ${!uploadBranch ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50' : 'bg-[#1A1A1A] hover:bg-[#222] text-zinc-300'}`}
          >
            <Plus size={16} className={!uploadBranch ? 'text-zinc-500' : 'text-emerald-500'} />
            <span>Manual Add</span>
          </button>
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-[#1A1A1A] border border-[#333] hover:bg-[#222] px-4 py-2.5 rounded text-xs transition-all font-bold text-zinc-300 uppercase tracking-wider self-end"
          >
            <Download size={16} className="text-zinc-500" />
            <span>Generate CSV</span>
          </button>
          <label className={`flex items-center gap-2 px-5 py-2.5 rounded cursor-pointer transition-all shadow-[0_4px_12px_rgba(16,185,129,0.2)] font-bold text-xs uppercase tracking-wider self-end ${!uploadBranch ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}>
            <Plus size={16} />
            <span>Batch Upload</span>
            <input 
              type="file" 
              multiple 
              accept="image/*,application/pdf" 
              className="hidden" 
              onChange={handleFileUpload}
              disabled={!uploadBranch}
            />
          </label>
        </div>
      </div>

      <AnimatePresence>
        {isUploading && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="bg-[#0A0A0A] border border-emerald-900/30 p-8 rounded shadow-2xl text-white space-y-6 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-8 opacity-5 text-emerald-500">
              <Upload size={120} />
            </div>
            <div className="relative z-10 max-w-2xl">
              <div className="flex justify-between items-end mb-4 font-mono">
                <div>
                   <h4 className="text-xs font-black uppercase tracking-[0.3em] text-emerald-500 mb-2">Neural Processing Engine</h4>
                   <p className="text-zinc-400 text-sm">Evaluating batches and extracting handwriting data...</p>
                </div>
                <span className="text-2xl font-black text-emerald-500">{Math.round(uploadProgress)}%</span>
              </div>
              <div className="w-full bg-[#151515] h-1.5 rounded-full overflow-hidden border border-[#222]">
                 <motion.div 
                   className="bg-emerald-500 h-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                   initial={{ width: 0 }}
                   animate={{ width: `${uploadProgress}%` }}
                 />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spreadsheet View */}
      <div className="bg-[#0D0D0D] border border-[#222] rounded-lg overflow-hidden shadow-2xl relative">
        <div className="overflow-x-auto font-mono">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#151515] border-b border-[#222]">
                <th className="pl-6 pr-2 py-4 w-12 border-r border-[#222] font-mono text-[9px] text-zinc-600 font-bold uppercase tracking-widest text-center">
                  #
                </th>
                <th 
                  onClick={() => requestSort('studentName')}
                  className="pl-6 pr-4 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 border-r border-[#222] cursor-pointer hover:bg-zinc-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Candidate Name
                    <SortIcon active={sortConfig?.key === 'studentName'} direction={sortConfig?.direction} />
                  </div>
                </th>
                <th 
                   onClick={() => requestSort('phoneNumber')}
                   className="px-4 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 border-r border-[#222] cursor-pointer hover:bg-zinc-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Phone Number
                    <SortIcon active={sortConfig?.key === 'phoneNumber'} direction={sortConfig?.direction} />
                  </div>
                </th>
                <th 
                   onClick={() => requestSort('branch')}
                   className="px-4 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 border-r border-[#222] cursor-pointer hover:bg-zinc-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Branch
                    <SortIcon active={sortConfig?.key === 'branch'} direction={sortConfig?.direction} />
                  </div>
                </th>
                {Array.from({length: batchQuestionCount}, (_, i) => i + 1).map(n => (
                  <th 
                    key={n} 
                    onClick={() => requestSort(`Q${n}`)}
                    className="px-3 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-center border-r border-[#222] cursor-pointer hover:bg-zinc-900 transition-colors"
                  >
                    <div className="flex flex-col items-center gap-1">
                      Q{n}
                      <SortIcon active={sortConfig?.key === `Q${n}`} direction={sortConfig?.direction} />
                    </div>
                  </th>
                ))}
                <th 
                  onClick={() => requestSort('totalScore')}
                  className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right border-r border-[#222] cursor-pointer hover:bg-zinc-900 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    Total
                    <SortIcon active={sortConfig?.key === 'totalScore'} direction={sortConfig?.direction} />
                  </div>
                </th>
                <th className="pl-4 pr-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#181818]">
              {sortedEvaluations.map((e, index) => (
                <tr key={e.id} className="hover:bg-[#111] transition-colors group text-sm bg-emerald-950/5">
                  <td className="pl-6 pr-2 py-3 border-r border-[#181818] font-mono text-[10px] text-zinc-500 font-bold text-center">
                    {sortConfig?.key === 'totalScore' ? rankingInfo.globalRanks[e.id] : 
                     sortConfig?.key === 'branch' ? rankingInfo.branchRanks[e.id] : 
                     index + 1}
                  </td>
                  <td className="pl-6 pr-4 py-3 border-r border-[#181818]">
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${e.status === 'processing' ? 'bg-amber-500 animate-pulse' : e.status === 'error' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`} />
                      <span className={`font-medium ${e.status === 'processing' ? 'text-zinc-600' : 'text-zinc-200'}`}>
                        {e.studentName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 border-r border-[#181818]">
                    {e.phoneNumber}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 border-r border-[#181818] uppercase text-[10px] tracking-widest font-bold">
                    {e.branch || '—'}
                  </td>
                  {Array.from({length: batchQuestionCount}, (_, i) => i + 1).map(n => (
                    <td key={n} className="px-3 py-3 text-center border-r border-[#181818]">
                      <span className={`${e.status === 'processing' ? 'text-zinc-800' : (e.scores as any)[`Q${n}`] > 0 ? 'text-emerald-400' : 'text-zinc-700'}`}>
                        {e.status === 'processing' ? '—' : ((e.scores as any)[`Q${n}`] || 0)}
                      </span>
                    </td>
                  ))}
                  <td className="px-6 py-3 text-right bg-emerald-950/10 border-r border-[#181818]">
                    <span className={`font-bold ${e.totalScore > 80 ? 'text-emerald-400' : e.totalScore > 40 ? 'text-emerald-600' : 'text-zinc-400'}`}>
                      {e.status === 'processing' ? '...' : e.totalScore}
                    </span>
                  </td>
                  <td className="pl-4 pr-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-40 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => setSelectedEvaluation(e)}
                        className="p-2 text-zinc-500 hover:text-emerald-500 transition-all uppercase text-[9px] font-black tracking-widest border border-[#333] rounded bg-[#1A1A1A] hover:bg-[#222]"
                      >
                        Evaluate
                      </button>
                      <button 
                        onClick={async () => {
                          await onDeleteEvaluation(e);
                        }}
                        className="p-2 text-zinc-700 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {evaluations.length === 0 && !isUploading && (
                <tr>
                  <td colSpan={6 + batchQuestionCount} className="py-32 text-center">
                    <div className="flex flex-col items-center gap-4 text-zinc-700">
                      <div className="w-12 h-12 rounded border border-zinc-800 flex items-center justify-center">
                        <AlertCircle size={24} strokeWidth={1.5} />
                      </div>
                      <div className="font-mono">
                        <h4 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 mb-1">Queue Empty</h4>
                        <p className="text-[10px] uppercase tracking-widest">Awaiting script intake stream</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selectedEvaluation && (
          <EvaluationEditor 
            evaluation={selectedEvaluation} 
            onClose={() => setSelectedEvaluation(null)} 
          />
        )}
      </AnimatePresence>

      {/* Manual Entry Modal */}
      <AnimatePresence>
        {isAddingManual && (
          <ManualAddModal 
            batchId={batchId} 
            branch={uploadBranch}
            onClose={() => setIsAddingManual(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ManualAddModal({ batchId, branch, onClose }: { batchId: string, branch: string, onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'evaluations'), {
        batchId,
        studentName: name,
        phoneNumber: phone || 'Unknown',
        branch: branch,
        scores: {},
        totalScore: 0,
        maxScore: 100,
        status: 'completed',
        isManual: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      onClose();
    } catch (error) {
      console.error("Save Error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-[#0D0D0D] border border-zinc-800 rounded-lg max-w-md w-full z-10 overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
          <h3 className="text-white font-bold uppercase tracking-widest text-xs">Add New Candidate</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-all"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Candidate Name</label>
            <input 
              required
              autoFocus
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-black border border-zinc-800 text-sm py-3 px-4 rounded focus:outline-none focus:border-emerald-500 text-white transition-all"
              placeholder="Full Name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Phone Number</label>
            <input 
              type="tel" 
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full bg-black border border-zinc-800 text-sm py-3 px-4 rounded focus:outline-none focus:border-emerald-500 text-white transition-all"
              placeholder="+880..."
            />
          </div>
          <div className="pt-4 flex gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-zinc-900 text-zinc-400 rounded font-bold text-xs uppercase tracking-widest hover:bg-zinc-800 transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSaving}
              className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded font-bold text-xs uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              <span>{isSaving ? 'Saving...' : 'Add Candidate'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function SortIcon({ active, direction }: { active: boolean, direction?: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown size={10} className="text-zinc-700" />;
  return direction === 'asc' ? <ChevronUp size={10} className="text-emerald-500" /> : <ChevronDown size={10} className="text-emerald-500" />;
}

function EvaluationEditor({ evaluation, onClose }: { evaluation: Evaluation, onClose: () => void }) {
  const [editedScores, setEditedScores] = useState<Record<string, number>>(evaluation.scores || {});
  const [editedName, setEditedName] = useState(evaluation.studentName);
  const [editedPhone, setEditedPhone] = useState(evaluation.phoneNumber);
  const [isSaving, setIsSaving] = useState(false);
  const [maxMarks, setMaxMarks] = useState(10);
  const [questionCount, setQuestionCount] = useState(10);
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Escape key to close
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    // Attempt to fetch batch settings
    const fetchBatch = async () => {
      const snap = await getDocs(query(collection(db, 'batches')));
      const b = snap.docs.find(d => d.id === evaluation.batchId);
      if (b) {
        const data = b.data();
        if (data.maxMarksPerQuestion) setMaxMarks(data.maxMarksPerQuestion);
        if (data.questionCount) setQuestionCount(data.questionCount);
      }
    };
    fetchBatch();
  }, [evaluation.batchId]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = inputRefs.current[index + 1];
      if (next) next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = inputRefs.current[index - 1];
      if (prev) prev.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        handleSave();
      }
    }
  };

  const handleScoreChange = (q: string, val: string | number) => {
    const num = typeof val === 'string' ? (parseInt(val) || 0) : val;
    setEditedScores(prev => ({ ...prev, [q]: Math.min(Math.max(0, num), 100) }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const scores = editedScores;
    const total = (Object.values(scores) as number[]).reduce((a: number, b: number) => a + b, 0);
    await updateDoc(doc(db, 'evaluations', evaluation.id), {
      studentName: editedName,
      phoneNumber: editedPhone,
      scores: scores,
      totalScore: total,
      isEdited: true,
      updatedAt: serverTimestamp()
    });
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-lg bg-[#050505] h-full relative z-10 shadow-[0_0_80px_rgba(0,0,0,0.5)] flex flex-col border-l border-[#222]"
      >
        <div className="p-6 border-b border-[#222] flex items-center justify-between bg-[#0A0A0A] sticky top-0 z-20">
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.3em] text-white">Manual Adjustment</h3>
            <p className="text-[10px] text-emerald-500 font-mono mt-1">Live Evaluation Synchronizer</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#111] rounded text-zinc-500 hover:text-white transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar">
          {/* Main Info */}
          <section className="p-4 bg-[#0A0A0A] border border-emerald-950/30 rounded">
            <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest mb-1">Editing Result For:</p>
            <h4 className="text-lg font-light text-zinc-100">{editedName}</h4>
          </section>

          <section className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Candidate Name</label>
              <input 
                type="text" 
                value={editedName} 
                onChange={e => setEditedName(e.target.value)}
                className="w-full bg-[#111] border border-[#222] px-4 py-2.5 rounded text-sm text-zinc-200 outline-none focus:border-emerald-500 transition-all font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Contact Number</label>
              <input 
                type="text" 
                value={editedPhone} 
                onChange={e => setEditedPhone(e.target.value)}
                className="w-full bg-[#111] border border-[#222] px-4 py-2.5 rounded text-sm text-emerald-500 outline-none focus:border-emerald-500 transition-all font-mono"
              />
            </div>
          </section>

          {/* Scores Grid */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Question Matrix</label>
              <div className="flex items-center gap-3">
                 <div className="flex items-center gap-2 bg-[#0D0D0D] px-3 py-1 rounded border border-[#181818]">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Max Mark:</span>
                    <input 
                      type="number" 
                      value={maxMarks} 
                      onChange={e => setMaxMarks(parseInt(e.target.value) || 0)}
                      className="w-8 bg-transparent text-emerald-500 font-bold outline-none text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                 </div>
                 <div className="bg-emerald-600 px-3 py-1 rounded text-white font-black text-xs shadow-lg shadow-emerald-600/20">
                    SUM: {(Object.values(editedScores) as number[]).reduce((a: number, b: number) => a + b, 0)}
                 </div>
              </div>
            </div>
            <div className="space-y-2">
              {Array.from({length: questionCount}, (_, i) => i + 1).map((n, idx) => (
                <div key={n} className="flex items-center gap-3 bg-[#0D0D0D] p-2 px-4 rounded border border-[#181818] group/row">
                  <label className="text-[11px] text-zinc-400 font-mono uppercase tracking-[0.1em] w-12 text-center">Q{n}</label>
                  
                  <div className="flex-1 flex items-center gap-2">
                    <button 
                      onClick={() => handleScoreChange(`Q${n}`, maxMarks)}
                      className="p-1 px-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 hover:bg-emerald-500 hover:text-black transition-all"
                      title="Mark Full Score"
                    >
                      <Check size={14} />
                    </button>
                    <button 
                      onClick={() => handleScoreChange(`Q${n}`, 0)}
                      className="p-1 px-3 rounded bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-50 hover:text-black transition-all"
                      title="Mark Zero"
                    >
                      <X size={14} />
                    </button>
                    
                    <input 
                      ref={el => inputRefs.current[idx] = el}
                      type="number" 
                      value={(editedScores as any)[`Q${n}`] || 0}
                      onChange={e => handleScoreChange(`Q${n}`, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, idx)}
                      className="flex-1 bg-black border border-[#333] text-center py-1.5 rounded text-sm text-emerald-400 font-bold focus:border-emerald-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Feedback */}
          <section className="space-y-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">AI Intelligence Insight</label>
            <div className="p-5 bg-[#0D0D0D] border border-zinc-800 rounded text-xs text-zinc-400 leading-relaxed font-mono italic">
              {evaluation.feedback || 'Analysing script content for behavioral feedback patterns...'}
            </div>
          </section>

          {/* Script Preview Disclaimer */}
          <section className="space-y-4">
             <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Source Evidence</label>
                <div className="px-3 py-1 bg-amber-500/10 rounded-lg text-[10px] font-bold text-amber-500">
                  METADATA ONLY
                </div>
             </div>
             <div className="p-6 bg-[#0D0D0D] border border-dashed border-zinc-800 rounded text-xs text-zinc-500 text-center">
               <p className="mb-2">To maintain peak system speed, script images are processed in real-time but not stored permanently in the database.</p>
               <p className="font-mono text-[10px] text-zinc-600 italic">Please refer to your original Drive folder for the full script visual.</p>
             </div>
          </section>
        </div>

        <div className="p-6 border-t border-[#222] flex gap-3 bg-[#0A0A0A] sticky bottom-0 z-20">
          <button 
            disabled={isSaving}
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-zinc-900 border border-[#333] text-zinc-500 text-[10px] font-bold uppercase tracking-widest rounded hover:bg-zinc-800 transition-all"
          >
            Discard
          </button>
          <button 
            disabled={isSaving}
            onClick={handleSave}
            className="flex-2 px-4 py-3 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest rounded hover:bg-emerald-500 transition-all shadow-[0_4px_12px_rgba(16,185,129,0.2)] flex items-center justify-center gap-2"
          >
            {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
            <span>Sync Record</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
