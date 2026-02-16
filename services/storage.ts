
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, Role, User } from '../types';
import { STORAGE_KEY, INITIAL_USERS, INITIAL_TASKS } from '../constants';

// Keys for user-provided cloud config
const SB_URL_KEY = 'B_PROGRESS_SB_URL';
const SB_KEY_KEY = 'B_PROGRESS_SB_KEY';

// Use provided credentials as default fallbacks
const DEFAULT_SB_URL = "https://bjrgpgkpmxvaffibnnwg.supabase.co";
const DEFAULT_SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqcmdwZ2twbXh2YWZmaWJubndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjEwMjksImV4cCI6MjA4NjgzNzAyOX0.n3ACOAtzVmSu-3FEVEYp_xJoBzDPmAVAM3CHYG-qLRI";

const supabaseUrl = process.env.SUPABASE_URL || localStorage.getItem(SB_URL_KEY) || DEFAULT_SB_URL;
const supabaseKey = process.env.SUPABASE_KEY || localStorage.getItem(SB_KEY_KEY) || DEFAULT_SB_KEY;

export const supabase: SupabaseClient | null = (supabaseUrl && supabaseKey && supabaseUrl !== 'undefined' && supabaseKey !== 'undefined')
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

// Keys for Mock Auth in LocalStorage
const MOCK_USERS_KEY = 'b_progress_mock_users';
const MOCK_SESSION_KEY = 'b_progress_mock_session';

export const DataService = {
  isCloudEnabled(): boolean {
    return !!supabase;
  },

  setCloudConfig(url: string, key: string) {
    localStorage.setItem(SB_URL_KEY, url);
    localStorage.setItem(SB_KEY_KEY, key);
    window.location.reload(); // Reload to re-initialize supabase client
  },

  clearCloudConfig() {
    localStorage.removeItem(SB_URL_KEY);
    localStorage.removeItem(SB_KEY_KEY);
    window.location.reload();
  },

  async signUp(email: string, password: string, metadata: any) {
    if (this.isCloudEnabled()) {
      const { data, error } = await supabase!.auth.signUp({
        email,
        password,
        options: { 
          data: {
            ...metadata,
            role: metadata.role || Role.FRIEND 
          } 
        }
      });
      if (error) throw error;
      return data.user;
    } else {
      // MOCK AUTH SIGNUP
      const mockUsers = JSON.parse(localStorage.getItem(MOCK_USERS_KEY) || '[]');
      if (mockUsers.find((u: any) => u.email === email)) throw new Error("User already exists locally");
      
      const newUser = {
        id: 'local-' + Math.random().toString(36).substr(2, 9),
        email,
        password, 
        user_metadata: metadata,
        created_at: new Date().toISOString()
      };
      
      mockUsers.push(newUser);
      localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(mockUsers));
      localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(newUser));
      return newUser;
    }
  },

  async signIn(email: string, password: string) {
    if (this.isCloudEnabled()) {
      const { data, error } = await supabase!.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      return data.user;
    } else {
      // MOCK AUTH SIGNIN
      const mockUsers = JSON.parse(localStorage.getItem(MOCK_USERS_KEY) || '[]');
      let user = mockUsers.find((u: any) => u.email === email && u.password === password);
      
      // Fallback to INITIAL_USERS (Hardcoded Admin)
      if (!user) {
        const initialAdmin = INITIAL_USERS.find(u => u.username === email && u.password === password);
        if (initialAdmin) {
          user = {
            id: initialAdmin.id,
            email: initialAdmin.username,
            password: initialAdmin.password,
            user_metadata: { name: initialAdmin.name, role: initialAdmin.role },
            created_at: initialAdmin.joinedAt
          };
        }
      }

      if (!user) throw new Error("Invalid credentials");
      
      localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(user));
      return user;
    }
  },

  async signOut() {
    if (supabase) await supabase.auth.signOut();
    localStorage.removeItem(MOCK_SESSION_KEY);
  },

  async getSession() {
    if (this.isCloudEnabled()) {
      try {
        const { data: { session } } = await supabase!.auth.getSession();
        return session?.user || null;
      } catch (e) {
        console.error("Session check failed", e);
        return null;
      }
    }
    const localSession = localStorage.getItem(MOCK_SESSION_KEY);
    return localSession ? JSON.parse(localSession) : null;
  },

  async loadState(userId: string): Promise<AppState> {
    const defaultState = {
      users: INITIAL_USERS,
      tasks: INITIAL_TASKS,
      records: [],
      messages: [],
      groups: [],
      statuses: [],
      currentUser: null,
    };

    if (this.isCloudEnabled() && userId && !userId.startsWith('local-')) {
      try {
        const { data, error } = await supabase!
          .from('app_state')
          .select('state_json')
          .eq('id', userId)
          .single();

        if (data && data.state_json) return data.state_json;
      } catch (e) {
        console.error("Cloud fetch failed:", e);
      }
    }

    const saved = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Local storage parse failed:", e);
      }
    }

    return defaultState;
  },

  async saveState(userId: string, state: AppState): Promise<void> {
    if (!userId) return;

    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(state));

    if (this.isCloudEnabled() && !userId.startsWith('local-')) {
      try {
        await supabase!
          .from('app_state')
          .upsert({ id: userId, state_json: state }, { onConflict: 'id' });
      } catch (e) {
        console.error("Cloud sync failed:", e);
      }
    }
  },

  async loadMasterState(): Promise<AppState> {
    const defaultState: AppState = {
      users: INITIAL_USERS,
      tasks: INITIAL_TASKS,
      records: [],
      messages: [],
      groups: [],
      statuses: [],
      currentUser: null,
    };

    if (this.isCloudEnabled()) {
      try {
        const { data, error } = await supabase!.from('app_state').select('state_json');
        if (error || !data) return defaultState;
        return data.reduce((acc, row) => {
          const userState: AppState = row.state_json;
          if (!userState) return acc;
          return this.mergeStates(acc, userState);
        }, defaultState);
      } catch (e) {
        return defaultState;
      }
    } else {
      const allKeys = Object.keys(localStorage);
      const stateKeys = allKeys.filter(k => k.startsWith(STORAGE_KEY + '_'));
      
      return stateKeys.reduce((acc, key) => {
        try {
          const userState = JSON.parse(localStorage.getItem(key) || '{}');
          return this.mergeStates(acc, userState);
        } catch(e) { return acc; }
      }, defaultState);
    }
  },

  mergeStates(acc: AppState, userState: AppState): AppState {
    return {
      ...acc,
      users: [...acc.users, ...(userState.currentUser ? [userState.currentUser] : [])],
      records: [...acc.records, ...(userState.records || [])],
      messages: [...acc.messages, ...(userState.messages || [])],
      statuses: [...acc.statuses, ...(userState.statuses || [])],
      groups: Array.from(new Map([...acc.groups, ...(userState.groups || [])].map(g => [g.id, g])).values()),
    };
  }
};
