import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { useToast, Center, Spinner } from '@chakra-ui/react';

interface RegionAccessMap { [state: string]: 'view' | 'edit' | 'admin'; }

interface AuthContextType {
  isAuthenticated: boolean;
  isAdmin: boolean;
  isFinance: boolean;
  isEditor: boolean;
  user: any | null;
  isLoading: boolean;
  assignedRegions: string[];
  allowedModules: string[];
  regionAccess: RegionAccessMap;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isAdmin: false,
  isFinance: false,
  isEditor: false,
  user: null,
  isLoading: true,
  assignedRegions: [],
  allowedModules: [],
  regionAccess: {},
  login: async () => false,
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isFinance, setIsFinance] = useState(false);
  const [isEditor, setIsEditor] = useState(false);
  const [user, setUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [assignedRegions, setAssignedRegions] = useState<string[]>([]);
  const [allowedModules, setAllowedModules] = useState<string[]>([]);
  const [regionAccess, setRegionAccess] = useState<RegionAccessMap>({});
  const navigate = useNavigate();
  const toast = useToast();

  // Fetch user's assigned regions and optional permissions
  const fetchUserAccess = async (userEmail: string): Promise<{ regions: string[]; modules: string[]; regionMap: RegionAccessMap }> => {
    try {
      const { data, error } = await supabase
        .from('project_assignments')
        .select('assigned_states, module_access, region_access')
        .eq('assignee_email', userEmail);

      if (error) {
        console.warn('Assignments fetch error for user:', userEmail, error);
        return { regions: [], modules: [], regionMap: {} };
      }

      const rows: any[] = Array.isArray(data) ? (data as any[]) : (data ? [data] : []);
      if (rows.length === 0) {
        return { regions: [], modules: [], regionMap: {} };
      }

      const regionSet = new Set<string>();
      const moduleSet = new Set<string>();
      const regionMap: RegionAccessMap = {};

      const rank: Record<'view'|'edit'|'admin', number> = { view: 1, edit: 2, admin: 3 };

      for (const row of rows) {
        const rStates: string[] = Array.isArray(row?.assigned_states) ? row.assigned_states : [];
        rStates.forEach((s) => s && regionSet.add(s));

        const mAccess: string[] = Array.isArray(row?.module_access) ? row.module_access : [];
        mAccess.forEach((m) => m && moduleSet.add(m));

        const rAccess = row?.region_access && typeof row.region_access === 'object' ? row.region_access as RegionAccessMap : {};
        for (const [state, level] of Object.entries(rAccess)) {
          const existing = regionMap[state as keyof RegionAccessMap];
          if (!existing || rank[level as 'view'|'edit'|'admin'] > rank[existing]) {
            regionMap[state] = level as 'view'|'edit'|'admin';
          }
        }
      }

      return { regions: Array.from(regionSet), modules: Array.from(moduleSet), regionMap };
    } catch (error) {
      console.error('Error fetching user access:', error);
      return { regions: [], modules: [], regionMap: {} };
    }
  };

  const handleAuthChange = async (session: Session | null) => {
    try {
      if (!session?.user?.id) {
        setIsAuthenticated(false);
        setIsAdmin(false);
        setIsFinance(false);
        setIsEditor(false);
        setUser(null);
        setAssignedRegions([]);
        setAllowedModules([]);
        setRegionAccess({});
        return;
      }

      const sessionEmail = (session.user.email || '').toLowerCase();

      // Check if the user is the finance user
      if (sessionEmail === 'dhanush@axisogreen.in') {
        setIsFinance(true);
      } else {
        setIsFinance(false);
      }

      // Check if the user has edit permissions (admin or contact)
      if (sessionEmail === 'admin@axisogreen.in' || sessionEmail === 'contact@axisogreen.in') {
        setIsEditor(true);
      } else {
        setIsEditor(false);
      }

      // First check if user exists in users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();

      let adminFlag = false;
      if (!userError && userData) {
        adminFlag = (userData as any)?.role === 'admin';
      } else {
        console.warn('User role not found or users table missing; defaulting to non-admin.', (userError as any)?.message || userError);
      }
      setIsAdmin(adminFlag);

      // Ensure a row exists in public.users for management views
      try {
        await supabase.from('users').upsert({ id: session.user.id, email: sessionEmail });
      } catch {}

      // Fetch assigned regions and permissions (defaults allow all modules when not configured)
      const { regions, modules, regionMap } = await fetchUserAccess(sessionEmail);
      setAssignedRegions(regions);
      setAllowedModules(Array.isArray(modules) ? modules : []);
      setRegionAccess(regionMap || {});

      setUser(session.user);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Error handling auth change:', error);
      setIsAuthenticated(false);
      setIsAdmin(false);
      setIsFinance(false);
      setIsEditor(false);
      setUser(null);
      setAssignedRegions([]);
      setAllowedModules([]);
      setRegionAccess({});
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const resp = await supabase.auth.getSession();
        const session = resp && resp.data ? resp.data.session : null;
        if (mounted) {
          await handleAuthChange(session);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: Session | null) => {
      if (mounted) {
        handleAuthChange(session);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const cleanedPassword = password.trim();

      if (!normalizedEmail || !cleanedPassword) {
        throw new Error('Email and password are required');
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: cleanedPassword,
      });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error('Login failed. Please verify your credentials and try again.');
      }

      setUser(data.user);
      setIsAuthenticated(true);
      setIsFinance(normalizedEmail === 'dhanush@axisogreen.in');
      setIsEditor(normalizedEmail === 'admin@axisogreen.in' || normalizedEmail === 'contact@axisogreen.in');

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .single();

      let adminFlag = false;
      if (!userError && userData) {
        adminFlag = (userData as any).role === 'admin';
      } else if (userError) {
        console.warn('User role lookup failed; defaulting to non-admin.', (userError as any)?.message || userError);
      }
      setIsAdmin(adminFlag);

      try {
        await supabase.from('users').upsert({ id: data.user.id, email: normalizedEmail });
      } catch {}

      const { regions, modules, regionMap } = await fetchUserAccess(normalizedEmail);
      setAssignedRegions(regions);
      setAllowedModules(Array.isArray(modules) ? modules : []);
      setRegionAccess(regionMap || {});

      toast({
        title: 'Login successful',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      return true;
    } catch (error: any) {
      const supabaseError = error as any;
      let message = (supabaseError && supabaseError.message) || String(error);

      // Map common supabase auth errors to friendlier messages
      if (supabaseError && (supabaseError.status === 400 || supabaseError.name === 'AuthApiError')) {
        if (message && message.toLowerCase().includes('invalid login credentials')) {
          message = 'Incorrect email or password. Please check your credentials and try again.';
        }
      }

      console.error('Login error:', message);

      setIsAuthenticated(false);
      setIsAdmin(false);
      setIsFinance(false);
      setIsEditor(false);
      setUser(null);
      setAssignedRegions([]);
      setAllowedModules([]);
      setRegionAccess({});

      toast({
        title: 'Login failed',
        description: message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      return false;
    }
  };

  const logout = async () => {
    try {
      // Always clear local state first
      setIsAuthenticated(false);
      setIsAdmin(false);
      setIsFinance(false);
      setIsEditor(false);
      setUser(null);
      setAssignedRegions([]);
      setAllowedModules([]);
      setRegionAccess({});

      // Try to sign out from Supabase, but don't fail if session is missing
      try {
        const { error } = await supabase.auth.signOut();
        if (error && !error.message?.includes('Auth session missing')) {
          // Only throw if it's not a session missing error
          throw error;
        }
      } catch (signOutError: any) {
        // Ignore session missing errors
        if (!signOutError.message?.includes('Auth session missing') &&
            !signOutError.name?.includes('AuthSessionMissingError')) {
          throw signOutError;
        }
      }

      navigate('/login');
    } catch (error: any) {
      console.error('Logout error:', error);

      // Always navigate to login even if logout fails
      navigate('/login');

      toast({
        title: 'Logout completed',
        description: 'You have been logged out',
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  if (isLoading) {
    return (
      <Center h="100vh">
        <Spinner size="xl" color="blue.500" />
      </Center>
    );
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isAdmin, isFinance, isEditor, user, isLoading, assignedRegions, allowedModules, regionAccess, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
