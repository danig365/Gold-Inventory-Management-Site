import { useState, useEffect } from 'react';
import { AppState } from '../types';
import { api } from '../api';

const STORAGE_KEY = 'haroon_gold_smith_v2';

/**
 * Custom hook for managing app state with server API persistence
 * Falls back to localStorage if server is unavailable
 */
export function useAppState(initialState: AppState) {
  const [state, setState] = useState<AppState>(initialState);
  const [useDatabase, setUseDatabase] = useState(true);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await api.getAppData();
        if (data) {
          setState(data);
          setUseDatabase(true);
          return;
        }
      } catch (error) {
        console.warn('Server not available, using localStorage:', error);
        setUseDatabase(false);
      }

      // Fallback to localStorage
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setState(JSON.parse(saved));
      }
    };

    loadData();
  }, []);

  // Save data on state change
  useEffect(() => {
    const saveData = async () => {
      try {
        if (useDatabase) {
          await api.saveAppData(state);
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
      } catch (error) {
        console.error('Error saving data:', error);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    };

    saveData();
  }, [state, useDatabase]);

  return [state, setState, useDatabase] as const;
}
