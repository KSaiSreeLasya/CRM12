import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  LinkBox,
  LinkOverlay,
  useToast,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../utils/error';

interface SalesTileProps {
  isMobile: boolean;
  cardBg: string;
  borderColor: string;
  titleColor: string;
  accentColor: string;
  onNavigateToFull: () => void;
}

interface Lead {
  id: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  location?: string;
  source_id?: string;
  assigned_to?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SalesPerson {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status: string;
}

interface LeadSource {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface PipelineStage {
  id: string;
  name: string;
  order_index: number;
  color: string;
}

interface LeadPipeline {
  id: string;
  lead_id: string;
  current_stage_id: string;
  created_at: string;
  updated_at: string;
}

const SalesTile: React.FC<SalesTileProps> = ({
  isMobile,
  cardBg,
  borderColor,
  titleColor,
  accentColor,
  onNavigateToFull,
}) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [pipelines, setPipelines] = useState<LeadPipeline[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLeads([]);
      setSalesPersons([]);
      setSources([]);
      setStages([]);
      setPipelines([]);
      return;
    }

    try {
      setLoading(true);

      const [{ data: leadsData }, { data: personsData }, { data: sourcesData }, { data: stagesData }, { data: pipelinesData }] = await Promise.all([
        supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('sales_persons').select('*').order('name'),
        supabase.from('lead_sources').select('*').order('name'),
        supabase.from('pipeline_stages').select('*').order('order_index'),
        supabase.from('lead_pipeline').select('*'),
      ]);

      setLeads(leadsData ?? []);
      setSalesPersons(personsData ?? []);
      setSources(sourcesData ?? []);
      setStages(stagesData ?? []);
      setPipelines(pipelinesData ?? []);
    } catch (error: any) {
      console.warn('Failed to fetch sales data', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    if (isSupabaseConfigured) {
      const leadsChannel = (supabase as any)
        .channel('realtime-leads')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
          fetchData();
        })
        .subscribe();

      const pipelineChannel = (supabase as any)
        .channel('realtime-lead-pipeline')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_pipeline' }, () => {
          fetchData();
        })
        .subscribe();

      return () => {
        try { (leadsChannel as any)?.unsubscribe?.(); } catch {}
        try { (pipelineChannel as any)?.unsubscribe?.(); } catch {}
      };
    }
  }, [fetchData]);

  const summary = useMemo(() => {
    const stageMap: Record<string, number> = {};
    stages.forEach((stage) => {
      stageMap[stage.id] = 0;
    });

    pipelines.forEach((pipeline) => {
      if (stageMap.hasOwnProperty(pipeline.current_stage_id)) {
        stageMap[pipeline.current_stage_id]++;
      }
    });

    return {
      total: leads.length,
      assigned: leads.filter((l) => l.assigned_to).length,
      unassigned: leads.filter((l) => !l.assigned_to).length,
      salesPersons: salesPersons.length,
      byStage: stageMap,
    };
  }, [leads, salesPersons, stages, pipelines]);

  const getSalesPerson = (personId: string | undefined) => {
    return salesPersons.find((p) => p.id === personId);
  };

  const getSource = (sourceId: string | undefined) => {
    return sources.find((s) => s.id === sourceId);
  };

  const getStage = (stageId: string | undefined) => {
    return stages.find((s) => s.id === stageId);
  };

  const getPipeline = (leadId: string) => {
    return pipelines.find((p) => p.lead_id === leadId);
  };

  const recentLeads = useMemo(() => {
    return leads.slice(0, 5);
  }, [leads]);

  const leadsByStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    stages.forEach((stage) => {
      map[stage.id] = [];
    });

    leads.forEach((lead) => {
      const pipeline = getPipeline(lead.id);
      if (pipeline && map[pipeline.current_stage_id]) {
        map[pipeline.current_stage_id].push(lead);
      }
    });

    return map;
  }, [leads, stages, pipelines]);

  return (
    <>
      <LinkBox
        as="article"
        role="group"
        minW={isMobile ? '260px' : undefined}
        maxW={isMobile ? '260px' : undefined}
        bg={cardBg}
        border="1px solid"
        borderColor={borderColor}
        borderRadius="xl"
        p={isMobile ? 5 : 6}
        boxShadow="sm"
        transition="all 0.2s"
        _hover={{ boxShadow: 'md', transform: 'translateY(-2px)' }}
      >
        <Flex justify="space-between" align="flex-start" gap={4} mb={2}>
          <Box>
            <Text fontSize={isMobile ? '3xl' : '4xl'} mb={2}>
              💼
            </Text>
            <Heading size="sm" mb={1} color={accentColor}>
              Sales Pipeline
            </Heading>
            <Text fontSize="sm" color={titleColor}>
              Manage leads and track sales progress
            </Text>
          </Box>
        </Flex>

        <Box mt={3}>
          <LinkOverlay as="button" onClick={() => onNavigateToFull()} color={accentColor}>
            Open
          </LinkOverlay>
        </Box>
      </LinkBox>
    </>
  );
};

export default SalesTile;
