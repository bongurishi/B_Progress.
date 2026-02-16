
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Role, User, ProgressRecord, Message, Group, StatusUpdate, Attachment } from './types';
import { DataService, supabase } from './services/storage';
import AuthScreen from './components/AuthScreen';
import Layout from './components/Layout';
import AdminDashboard from './components/AdminDashboard';
import FriendDashboard from './components/FriendDashboard';

const App: React.FC = () => {
  const [state, setState] = useState<AppState | null>(null);
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(true);
  const isInitialLoad = useRef(true);

  // 1. Session Initialization
  useEffect(() => {
    const initSession = async () => {
      setIsSyncing(true);
      const user = await DataService.getSession();
      setSessionUser(user);
      
      // Setup listener if Supabase exists
      if (supabase) {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
          const currentUser = session?.user || null;
          setSessionUser(currentUser);
        });
        return () => subscription?.unsubscribe();
      }
      
      if (!user) setIsSyncing(false);
    };

    initSession();
  }, []);

  // 2. Load Data when Session changes
  useEffect(() => {
    if (sessionUser) {
      const initData = async () => {
        setIsSyncing(true);
        
        const role = sessionUser.user_metadata?.role || Role.FRIEND;
        let data: AppState;

        if (role === Role.ADMIN) {
          data = await DataService.loadMasterState();
        } else {
          data = await DataService.loadState(sessionUser.id);
        }
        
        const userWithMeta: User = {
          id: sessionUser.id,
          name: sessionUser.user_metadata?.name || sessionUser.email?.split('@')[0] || 'User',
          username: sessionUser.email || '',
          role: role,
          joinedAt: sessionUser.created_at
        };

        setState({ ...data, currentUser: userWithMeta });
        setIsSyncing(false);
        setTimeout(() => { isInitialLoad.current = false; }, 500);
      };
      initData();
    } else {
      setIsSyncing(false);
    }
  }, [sessionUser]);

  // 3. Auto Save
  useEffect(() => {
    if (state && sessionUser && !isInitialLoad.current) {
      if (state.currentUser?.role !== Role.ADMIN) {
        DataService.saveState(sessionUser.id, state);
      }
    }
  }, [state, sessionUser]);

  const handleLogout = async () => {
    setIsSyncing(true);
    await DataService.signOut();
    setSessionUser(null);
    setState(null);
    setIsSyncing(false);
  };

  const handleUpdateRecord = useCallback((recordUpdate: Partial<ProgressRecord>) => {
    setState(prev => {
      if (!prev) return null;
      const records = [...prev.records];
      const existingIdx = records.findIndex(r => 
        r.userId === recordUpdate.userId && 
        r.date === recordUpdate.date
      );

      if (existingIdx > -1) {
        records[existingIdx] = { ...records[existingIdx], ...recordUpdate };
      } else {
        const newRecord: ProgressRecord = {
          id: Math.random().toString(36).substr(2, 9),
          userId: recordUpdate.userId!,
          date: recordUpdate.date!,
          tasksCompleted: recordUpdate.tasksCompleted || [],
          timeSpentMinutes: recordUpdate.timeSpentMinutes || 0,
          remarks: recordUpdate.remarks || '',
          dayJournal: recordUpdate.dayJournal || '',
          mood: recordUpdate.mood || ''
        };
        records.push(newRecord);
      }
      return { ...prev, records };
    });
  }, []);

  const handleSendMessage = useCallback((receiverId: string, content: string, attachment?: Attachment) => {
    setState(prev => {
      if (!prev || !prev.currentUser || (!content.trim() && !attachment)) return prev;
      const newMessage: Message = {
        id: Math.random().toString(36).substr(2, 9),
        senderId: prev.currentUser.id,
        receiverId,
        content,
        attachment,
        timestamp: new Date().toISOString(),
      };
      return {
        ...prev,
        messages: [...prev.messages, newMessage]
      };
    });
  }, []);

  if (isSyncing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white text-3xl animate-bounce shadow-2xl shadow-indigo-200 mb-8">
          <i className="fas fa-shield-check animate-pulse"></i>
        </div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Syncing Session</h2>
        <p className="text-[10px] text-slate-400 mt-2 uppercase tracking-widest font-black">Establishing Secure Environment...</p>
      </div>
    );
  }

  if (!sessionUser || !state) {
    return <AuthScreen onLoginSuccess={() => {}} />;
  }

  return (
    <Layout user={state.currentUser!} onLogout={handleLogout}>
      {state.currentUser?.role === Role.ADMIN ? (
        <AdminDashboard 
          state={state} 
          onSendMessage={handleSendMessage}
          onAddGroup={() => {}} 
          onPostToGroup={() => {}} 
          onUpdateGroupMembers={() => {}}
        />
      ) : (
        <FriendDashboard 
          user={state.currentUser!} 
          state={state} 
          onUpdateRecord={handleUpdateRecord} 
          onSendMessage={(content, attachment) => handleSendMessage('admin-id', content, attachment)}
          onUploadStatus={(content, attachment) => {
             setState(prev => {
               if (!prev || !prev.currentUser) return prev;
               const newStatus: StatusUpdate = {
                 id: Math.random().toString(36).substr(2, 9),
                 userId: prev.currentUser.id,
                 userName: prev.currentUser.name,
                 content,
                 attachment,
                 timestamp: new Date().toISOString()
               };
               return { ...prev, statuses: [...prev.statuses, newStatus] };
             });
          }}
        />
      )}
    </Layout>
  );
};

export default App;