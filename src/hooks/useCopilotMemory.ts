import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ExtractedMemory } from '../agent/agent-client';

export type MemoryCategory = 'general' | 'preference' | 'project_insight' | 'domain_knowledge';

export interface MemoryEntry {
  id: string;
  user_id: string;
  category: MemoryCategory;
  content: string;
  source_project_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Max memories to inject into system prompt */
const MAX_MEMORY_ITEMS = 20;

export function useCopilotMemory(userId?: string) {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMemories = useCallback(async () => {
    if (!userId) {
      setMemories([]);
      return;
    }
    setLoading(true);

    const { data, error } = await supabase
      .from('copilot_memory')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(MAX_MEMORY_ITEMS);

    if (!error && data) {
      setMemories(data as MemoryEntry[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  /** Add a new memory entry */
  const addMemory = useCallback(
    async (category: MemoryCategory, content: string, sourceProjectId?: string) => {
      if (!userId) return;

      const { data, error } = await supabase
        .from('copilot_memory')
        .insert({
          user_id: userId,
          category,
          content,
          source_project_id: sourceProjectId ?? null,
        })
        .select()
        .single();

      if (!error && data) {
        setMemories((prev) => [data as MemoryEntry, ...prev].slice(0, MAX_MEMORY_ITEMS));
      }
    },
    [userId],
  );

  /** Delete a memory entry */
  const deleteMemory = useCallback(async (memoryId: string) => {
    await supabase.from('copilot_memory').delete().eq('id', memoryId);
    setMemories((prev) => prev.filter((m) => m.id !== memoryId));
  }, []);

  /** Build a formatted string to inject into system prompt */
  const buildMemoryPrompt = useCallback((): string => {
    if (memories.length === 0) return '';

    const grouped: Record<string, string[]> = {};
    for (const m of memories) {
      const key = m.category;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m.content);
    }

    const sections: string[] = [];
    const categoryLabels: Record<MemoryCategory, string> = {
      preference: 'User Preferences',
      project_insight: 'Project Insights',
      domain_knowledge: 'Domain Knowledge',
      general: 'General Notes',
    };

    for (const cat of ['preference', 'project_insight', 'domain_knowledge', 'general'] as MemoryCategory[]) {
      const items = grouped[cat];
      if (items && items.length > 0) {
        sections.push(`**${categoryLabels[cat]}:**\n${items.map((i) => `- ${i}`).join('\n')}`);
      }
    }

    return `\n\n--- LONG-TERM MEMORY (from previous sessions) ---\n${sections.join('\n\n')}`;
  }, [memories]);

  /** Batch-save memories extracted by the agent via <memory_extract> tags */
  const saveExtractedMemories = useCallback(
    async (extracted: ExtractedMemory[], sourceProjectId?: string) => {
      if (!userId || extracted.length === 0) return;

      for (const mem of extracted) {
        // Deduplicate: skip if exact content already exists in same category
        const dup = memories.find(
          (m) => m.category === mem.category && m.content.toLowerCase() === mem.content.toLowerCase(),
        );
        if (dup) {
          // Refresh timestamp so it stays relevant
          await supabase
            .from('copilot_memory')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', dup.id);
        } else {
          await addMemory(mem.category, mem.content, sourceProjectId);
        }
      }
      await loadMemories();
    },
    [userId, memories, addMemory, loadMemories],
  );

  /** Search memories relevant to a query (keyword-based RAG) */
  const searchMemories = useCallback(
    (query: string, limit = 5): MemoryEntry[] => {
      if (!query.trim() || memories.length === 0) return [];
      const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      if (tokens.length === 0) return memories.slice(0, limit);

      return memories
        .map((m) => {
          const text = m.content.toLowerCase();
          const hits = tokens.filter((t) => text.includes(t)).length;
          return { ...m, relevance: hits / tokens.length };
        })
        .filter((m) => m.relevance > 0)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, limit);
    },
    [memories],
  );

  return {
    memories, loading,
    addMemory, deleteMemory,
    saveExtractedMemories, searchMemories,
    buildMemoryPrompt, reload: loadMemories,
  };
}
