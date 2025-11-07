import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Heading,
  Text,
  SimpleGrid,
  Flex,
  Button,
  useDisclosure,
  useToast,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Select,
  Textarea,
  VStack,
  HStack,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Avatar,
  Spinner,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useColorModeValue,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
} from '@chakra-ui/react';
import { EditIcon, DeleteIcon, AddIcon } from '@chakra-ui/icons';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../utils/error';
import NavigationHeader from '../components/NavigationHeader';

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
  source?: LeadSource;
  assigned_person?: SalesPerson;
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
  call_notes?: string;
  call_response?: string;
  location_details?: string;
  site_visit_date?: string;
  site_visit_notes?: string;
  advance_payment_amount?: number;
  advance_payment_date?: string;
  created_at: string;
  updated_at: string;
}

const Sales: React.FC = () => {
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const titleColor = useColorModeValue('gray.700', 'gray.200');
  
  const toast = useToast();
  const { isOpen: isAddLeadOpen, onOpen: onAddLeadOpen, onClose: onAddLeadClose } = useDisclosure();
  const { isOpen: isAddPersonOpen, onOpen: onAddPersonOpen, onClose: onAddPersonClose } = useDisclosure();
  const { isOpen: isDetailsOpen, onOpen: onDetailsOpen, onClose: onDetailsClose } = useDisclosure();
  const { isOpen: isDashboardOpen, onOpen: onDashboardOpen, onClose: onDashboardClose } = useDisclosure();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [pipelines, setPipelines] = useState<LeadPipeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const [newLeadData, setNewLeadData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    location: '',
    source_id: '',
    assigned_to: '',
  });

  const [newPersonData, setNewPersonData] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [newSourceData, setNewSourceData] = useState({
    name: '',
    icon: '',
    color: '',
  });

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    try {
      setLoading(true);

      const [{ data: leadsData }, { data: personsData }, { data: sourcesData }, { data: stagesData }, { data: pipelinesData }] = await Promise.all([
        supabase.from('leads').select('*').order('created_at', { ascending: false }),
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
      console.error('Failed to fetch sales data', error);
      toast({
        title: 'Failed to load sales data',
        description: formatSupabaseError(error),
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Google Sheet sync: periodically fetch public sheet and merge into leads list
  useEffect(() => {
    let mounted = true;
    let intervalId: any = null;
    const sheetUrl = 'https://docs.google.com/spreadsheets/d/1QY8_Q8-ybLKNVs4hynPZslZDwUfC-PIJrViJfL0-tpM/edit?usp=sharing';

    const doSync = async () => {
      try {
        const { fetchGoogleSheetLeads } = await import('../utils/sheetSync');
        const sheetLeads = await fetchGoogleSheetLeads(sheetUrl);
        if (!mounted || !sheetLeads || sheetLeads.length === 0) return;

        // Merge logic: prefer id match, then email, then phone, then normalized name
        setLeads((current) => {
          const byId = new Map<string, any>();
          const byEmail = new Map<string, any>();
          const byPhone = new Map<string, any>();
          const byName = new Map<string, any>();

          const normalizeName = (n: any) => (String(n || '').trim().toLowerCase().replace(/\s+/g, ' '));

          current.forEach((l) => {
            if (l.id) byId.set(String(l.id), l);
            if (l.customer_email) byEmail.set(String(l.customer_email).toLowerCase(), l);
            if (l.customer_phone) byPhone.set(String(l.customer_phone), l);
            if (l.customer_name) byName.set(normalizeName(l.customer_name), l);
          });

          const newLeads = [...current];

          let skipped = 0;

          (sheetLeads as any[]).forEach((s) => {
            // normalize keys to expected
            const email = (s.customer_email || s.email || '').toLowerCase();
            const phone = (s.customer_phone || s.phone || '')
              ? String(s.customer_phone || s.phone).trim()
              : '';
            const sid = s.id ? String(s.id) : null;
            const nameNorm = normalizeName(s.customer_name || s.name || '');

            // skip rows that have no meaningful identifying fields
            if (!sid && !email && !phone && !nameNorm) {
              skipped += 1;
              return;
            }

            let existing = null;
            if (sid && byId.has(sid)) {
              existing = byId.get(sid);
            } else if (email && byEmail.has(email)) {
              existing = byEmail.get(email);
            } else if (phone && byPhone.has(phone)) {
              existing = byPhone.get(phone);
            } else if (nameNorm && byName.has(nameNorm)) {
              existing = byName.get(nameNorm);
            }

            if (existing) {
              // update existing in place
              Object.assign(existing, s);

              // schedule update to supabase for matched row (allowed fields only)
              (async () => {
                try {
                  if (isSupabaseConfigured && existing.id) {
                    const updatePayload: any = {};
                    if (s.customer_name) updatePayload.customer_name = s.customer_name;
                    if (s.customer_phone || s.phone) updatePayload.customer_phone = s.customer_phone || s.phone;
                    if (s.customer_email || s.email) updatePayload.customer_email = s.customer_email || s.email;
                    if (s.location) updatePayload.location = s.location;
                    if (s.source || s.source_id) updatePayload.source_id = s.source || s.source_id;
                    if (s.assigned_to) updatePayload.assigned_to = s.assigned_to;
                    if (s.status) updatePayload.status = s.status;

                    const keys = Object.keys(updatePayload);
                    if (keys.length > 0) {
                      const { error } = await supabase.from('leads').update(updatePayload).eq('id', existing.id);
                      if (error) {
                        console.warn('Supabase update error for matched sheet lead', error);
                        toast({ title: 'Sheet sync: failed to update lead', description: formatSupabaseError(error), status: 'warning', duration: 5000, isClosable: true });
                      }
                    }
                  }
                } catch (err) {
                  console.warn('Failed to update matched sheet lead to supabase', err);
                  toast({ title: 'Sheet sync: unexpected error updating lead', description: String(err), status: 'error', duration: 5000, isClosable: true });
                }
              })();
            } else {
              // new lead: create minimal Lead object
              const newLead: any = {
                id: s.id || undefined,
                customer_name: s.customer_name || s.name || '',
                customer_phone: s.customer_phone || s.phone || '',
                customer_email: s.customer_email || s.email || '',
                location: s.location || '',
                source_id: s.source || s.source_id || null,
                assigned_to: s.assigned_to || null,
                status: s.status || 'new',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };

              newLeads.unshift(newLead);

              // add to name map to avoid duplicate insert from same batch
              if (newLead.customer_name) byName.set(normalizeName(newLead.customer_name), newLead);

              // Attempt to insert into Supabase, but don't block UI
              (async () => {
                try {
                  if (isSupabaseConfigured) {
                    const insertPayload: any = {
                      customer_name: newLead.customer_name,
                      customer_phone: newLead.customer_phone,
                      customer_email: newLead.customer_email,
                      location: newLead.location,
                      source_id: newLead.source_id,
                      assigned_to: newLead.assigned_to,
                      status: newLead.status,
                    };

                    const { data, error } = await supabase.from('leads').insert([insertPayload]).select();
                    if (!error && data && data.length > 0) {
                      // replace temporary lead with persisted row
                      const persisted = data[0];
                      newLeads[newLeads.findIndex((l) => l === newLead)] = persisted;
                      // also update maps
                      if (persisted.id) byId.set(String(persisted.id), persisted);
                      if (persisted.customer_email) byEmail.set(String(persisted.customer_email).toLowerCase(), persisted);
                      if (persisted.customer_phone) byPhone.set(String(persisted.customer_phone), persisted);
                      if (persisted.customer_name) byName.set(normalizeName(persisted.customer_name), persisted);
                    } else if (error) {
                      console.warn('Supabase insert error for sheet lead', error);
                      toast({ title: 'Sheet sync: failed to save new lead', description: formatSupabaseError(error), status: 'warning', duration: 5000, isClosable: true });
                    }
                  }
                } catch (err) {
                  console.warn('Failed to persist sheet lead to supabase', err);
                  toast({ title: 'Sheet sync: unexpected error saving lead', description: String(err), status: 'error', duration: 5000, isClosable: true });
                }
              })();
            }
          });

          if (skipped > 0) console.debug(`Sheet sync skipped ${skipped} empty rows`);

          return newLeads;
        });
      } catch (err) {
        console.error('Sheet sync error', err);
        try {
          toast({
            title: 'Sheet sync failed',
            description: String((err && (err as Error).message) || 'Failed to fetch Google Sheet. Make sure it is published and public.'),
            status: 'warning',
            duration: 8000,
            isClosable: true,
          });
        } catch (e) {}
      }
    };

    // initial sync after a short delay to let fetchData populate current leads
    const initTimeout = setTimeout(() => doSync(), 3000);
    intervalId = setInterval(() => doSync(), 60 * 1000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
      clearTimeout(initTimeout);
    };
  }, [setLeads]);

  const handleAddLead = async () => {
    if (!newLeadData.customer_name.trim()) {
      toast({ title: 'Please enter customer name', status: 'warning' });
      return;
    }

    try {
      const { data: leadData, error: leadError } = await supabase.from('leads').insert([newLeadData]).select();
      
      if (leadError) throw leadError;

      if (leadData && leadData.length > 0) {
        const leadId = leadData[0].id;
        const firstStageId = stages[0]?.id;

        if (firstStageId) {
          const { error: pipelineError } = await supabase.from('lead_pipeline').insert([
            {
              lead_id: leadId,
              current_stage_id: firstStageId,
            },
          ]);

          if (pipelineError) throw pipelineError;
        }
      }

      toast({ title: 'Lead added successfully', status: 'success', duration: 3000 });
      setNewLeadData({
        customer_name: '',
        customer_phone: '',
        customer_email: '',
        location: '',
        source_id: '',
        assigned_to: '',
      });
      onAddLeadClose();
      await fetchData();
    } catch (error: any) {
      console.error('Failed to add lead', error);
      toast({
        title: 'Failed to add lead',
        description: formatSupabaseError(error),
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const handleAddPerson = async () => {
    if (!newPersonData.name.trim()) {
      toast({ title: 'Please enter person name', status: 'warning' });
      return;
    }

    try {
      const { error } = await supabase.from('sales_persons').insert([newPersonData]);
      
      if (error) throw error;

      toast({ title: 'Sales person added successfully', status: 'success', duration: 3000 });
      setNewPersonData({ name: '', email: '', phone: '' });
      onAddPersonClose();
      await fetchData();
    } catch (error: any) {
      console.error('Failed to add sales person', error);
      toast({
        title: 'Failed to add sales person',
        description: formatSupabaseError(error),
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const handleAddSource = async () => {
    if (!newSourceData.name.trim()) {
      toast({ title: 'Please enter source name', status: 'warning' });
      return;
    }

    try {
      const { error } = await supabase.from('lead_sources').insert([newSourceData]);

      if (error) throw error;

      toast({ title: 'Lead source added successfully', status: 'success', duration: 3000 });
      setNewSourceData({ name: '', icon: '', color: '' });
      await fetchData();
    } catch (error: any) {
      console.error('Failed to add lead source', error);
      toast({
        title: 'Failed to add lead source',
        description: formatSupabaseError(error),
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const handleAssignLead = async (leadId: string, personId: string) => {
    try {
      const { error } = await supabase.from('leads').update({ assigned_to: personId }).eq('id', leadId);
      
      if (error) throw error;

      toast({ title: 'Lead assigned successfully', status: 'success', duration: 3000 });
      await fetchData();
    } catch (error: any) {
      console.error('Failed to assign lead', error);
      toast({
        title: 'Failed to assign lead',
        description: formatSupabaseError(error),
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const handleMoveStage = async (leadId: string, newStageId: string) => {
    try {
      const pipeline = pipelines.find((p) => p.lead_id === leadId);
      if (!pipeline) return;

      const { error } = await supabase.from('lead_pipeline').update({ current_stage_id: newStageId }).eq('id', pipeline.id);
      
      if (error) throw error;

      toast({ title: 'Lead moved to new stage', status: 'success', duration: 3000 });
      await fetchData();
    } catch (error: any) {
      console.error('Failed to move lead', error);
      toast({
        title: 'Failed to move lead',
        description: formatSupabaseError(error),
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!window.confirm('Are you sure you want to delete this lead?')) return;

    try {
      const { error } = await supabase.from('leads').delete().eq('id', leadId);
      
      if (error) throw error;

      toast({ title: 'Lead deleted successfully', status: 'success', duration: 3000 });
      await fetchData();
    } catch (error: any) {
      console.error('Failed to delete lead', error);
      toast({
        title: 'Failed to delete lead',
        description: formatSupabaseError(error),
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

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

  const summaryStats = useMemo(() => {
    return {
      total: leads.length,
      assigned: leads.filter((l) => l.assigned_to).length,
      unassigned: leads.filter((l) => !l.assigned_to).length,
      salesPersons: salesPersons.length,
    };
  }, [leads, salesPersons]);

  if (!isSupabaseConfigured) {
    return (
      <Box p={6}>
        <NavigationHeader title="Sales Pipeline" />
        <Box bg="yellow.50" border="1px solid" borderColor="yellow.200" borderRadius="md" p={4} mt={4}>
          <Text color="yellow.800">Supabase is not configured. Please set up your environment variables.</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box px={{ base: 4, md: 6 }} py={{ base: 4, md: 6 }} maxW="1400px" mx="auto">
      <NavigationHeader title="Sales Pipeline" />

      {/* Summary Cards */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} my={6}>
        <Card bg={cardBg}>
          <CardBody>
            <Text fontSize="sm" color={titleColor}>Total Leads</Text>
            <Heading size="lg" color="green.600">{summaryStats.total}</Heading>
          </CardBody>
        </Card>
        <Card bg={cardBg}>
          <CardBody>
            <Text fontSize="sm" color={titleColor}>Assigned</Text>
            <Heading size="lg" color="blue.600">{summaryStats.assigned}</Heading>
          </CardBody>
        </Card>
        <Card bg={cardBg}>
          <CardBody>
            <Text fontSize="sm" color={titleColor}>Unassigned</Text>
            <Heading size="lg" color="orange.600">{summaryStats.unassigned}</Heading>
          </CardBody>
        </Card>
        <Card bg={cardBg}>
          <CardBody>
            <Text fontSize="sm" color={titleColor}>Sales Persons</Text>
            <Heading size="lg" color="purple.600">{summaryStats.salesPersons}</Heading>
          </CardBody>
        </Card>
      </SimpleGrid>

      {/* Action Buttons */}
      <Flex gap={3} mb={6} align="center">
        <Button leftIcon={<AddIcon />} colorScheme="green" onClick={onAddLeadOpen}>
          Add Lead
        </Button>
        <Button leftIcon={<AddIcon />} colorScheme="purple" variant="outline" onClick={onAddPersonOpen}>
          Add Sales Person
        </Button>
        <Button ml="auto" colorScheme="green" variant="ghost" onClick={onDashboardOpen}>
          Sales Dashboard
        </Button>
      </Flex>

      {/* Dashboard Modal */}
      <Modal isOpen={isDashboardOpen} onClose={onDashboardClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <Heading size="md" bgGradient="linear(to-r, green.400, blue.400)" bgClip="text">Sales Dashboard</Heading>
            <Text fontSize="sm" color="gray.500">Quick overview of pipeline health and recent activity</Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={4} mb={4}>
              <Card bg="linear-gradient(135deg,#e6fffa,#f0fff4)">
                <CardBody>
                  <Text fontSize="sm" color={titleColor}>Total Leads</Text>
                  <Heading size="lg" color="green.600">{summaryStats.total}</Heading>
                </CardBody>
              </Card>
              <Card bg="linear-gradient(135deg,#ebf8ff,#f0f9ff)">
                <CardBody>
                  <Text fontSize="sm" color={titleColor}>Assigned</Text>
                  <Heading size="lg" color="blue.600">{summaryStats.assigned}</Heading>
                </CardBody>
              </Card>
              <Card bg="linear-gradient(135deg,#fff7ed,#fff8ef)">
                <CardBody>
                  <Text fontSize="sm" color={titleColor}>Unassigned</Text>
                  <Heading size="lg" color="orange.600">{summaryStats.unassigned}</Heading>
                </CardBody>
              </Card>
              <Card bg="linear-gradient(135deg,#f5f3ff,#faf5ff)">
                <CardBody>
                  <Text fontSize="sm" color={titleColor}>Sales Persons</Text>
                  <Heading size="lg" color="purple.600">{summaryStats.salesPersons}</Heading>
                </CardBody>
              </Card>
            </SimpleGrid>

            <Text fontSize="sm" fontWeight="semibold" mb={2}>Leads by Stage</Text>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} mb={4}>
              {stages.map((stage) => (
                <Box key={stage.id} p={3} borderRadius="md" bg={stage.color || 'gray.50'} color="white">
                  <Flex justify="space-between" align="center">
                    <Text fontWeight="semibold">{stage.name}</Text>
                    <Badge bg="rgba(255,255,255,0.2)">{(leadsByStage[stage.id] || []).length}</Badge>
                  </Flex>
                </Box>
              ))}
            </SimpleGrid>

            <Text fontSize="sm" fontWeight="semibold" mb={2}>Recent Leads</Text>
            {loading ? (
              <Flex justify="center" p={6}><Spinner /></Flex>
            ) : (
              <TableContainer border="1px solid" borderColor={borderColor} borderRadius="lg">
                <Table variant="simple" size="sm">
                  <Thead bg="gray.50">
                    <Tr>
                      <Th>Customer</Th>
                      <Th>Phone</Th>
                      <Th>Stage</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {leads.slice(0,6).map((lead, __idx) => {
                      const pipeline = getPipeline(lead.id);
                      const stage = getStage(pipeline?.current_stage_id);
                      const sourceObj = getSource(lead.source_id) || (lead.source && typeof lead.source !== 'string' ? lead.source : undefined);
                      const sourceText: string = sourceObj ? `${(sourceObj as LeadSource).icon} ${(sourceObj as LeadSource).name}` : (typeof lead.source === 'string' && lead.source) ? lead.source : (lead.source_id ? String(lead.source_id) : '—');
                      const _key = lead.id || `${lead.customer_email || lead.customer_phone || 'lead'}-${__idx}`;
                      return (
                        <Tr key={_key}>
                          <Td fontWeight="medium">{lead.customer_name}</Td>
                          <Td>{lead.customer_phone || '—'}</Td>
                          <Td>{stage ? <Badge colorScheme="green">{stage.name}</Badge> : '—'}</Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </TableContainer>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onDashboardClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Tabs for different views */}
      <Tabs isLazy>
        <TabList>
          <Tab>Pipeline View</Tab>
          <Tab>Lead List</Tab>
          <Tab>Sales Persons</Tab>
          <Tab>Add Lead</Tab>
          <Tab>Assign Leads</Tab>
          <Tab>Lead Sources</Tab>
          <Tab>Add Sales Person</Tab>
        </TabList>

        <TabPanels>
          {/* Pipeline View */}
          <TabPanel>
            <SimpleGrid columns={{ base: 1, md: 2, lg: stages.length > 4 ? 4 : stages.length }} spacing={4}>
              {stages.map((stage) => (
                <Box key={stage.id} bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="lg" p={4}>
                  <Heading size="sm" color="green.600" mb={4}>
                    {stage.name}
                  </Heading>
                  <VStack spacing={3} align="stretch">
                    {leadsByStage[stage.id]?.map((lead, __idx) => {
                      const person = getSalesPerson(lead.assigned_to);
                      const sourceObj = getSource(lead.source_id) || (lead.source && typeof lead.source !== 'string' ? lead.source : undefined);
                      const sourceText: string | null = sourceObj ? `${(sourceObj as LeadSource).icon} ${(sourceObj as LeadSource).name}` : (typeof lead.source === 'string' && lead.source) ? lead.source : (lead.source_id ? String(lead.source_id) : null);
                      const _key = lead.id || `${lead.customer_email || lead.customer_phone || 'lead'}-${stage.id}-${__idx}`;
                      return (
                        <Card key={_key} size="sm" bg={cardBg} borderColor={borderColor} border="1px solid" cursor="pointer" _hover={{ shadow: 'md' }}>
                          <CardBody>
                            <VStack align="start" spacing={2}>
                              <Heading size="xs">{lead.customer_name}</Heading>
                              {sourceText && <Badge fontSize="xs">{sourceText}</Badge>}
                              {person ? (
                                <HStack spacing={2} fontSize="xs">
                                  <Avatar size="xs" name={person.name} />
                                  <Text>{person.name}</Text>
                                </HStack>
                              ) : (
                                <Text fontSize="xs" color="orange.600">Unassigned</Text>
                              )}
                              {lead.customer_phone && <Text fontSize="xs" color={titleColor}>{lead.customer_phone}</Text>}
                              {lead.location && <Text fontSize="xs" color={titleColor}>{lead.location}</Text>}
                              <HStack spacing={2} mt={2}>
                                <Menu>
                                  <MenuButton as={Button} size="xs" variant="outline">
                                    Move
                                  </MenuButton>
                                  <MenuList>
                                    {stages
                                      .filter((s) => s.id !== stage.id)
                                      .map((s) => (
                                        <MenuItem key={s.id} onClick={() => handleMoveStage(lead.id, s.id)}>
                                          {s.name}
                                        </MenuItem>
                                      ))}
                                  </MenuList>
                                </Menu>
                                <Menu>
                                  <MenuButton as={Button} size="xs" variant="outline">
                                    Assign
                                  </MenuButton>
                                  <MenuList>
                                    {salesPersons.map((person) => (
                                      <MenuItem key={person.id} onClick={() => handleAssignLead(lead.id, person.id)}>
                                        {person.name}
                                      </MenuItem>
                                    ))}
                                  </MenuList>
                                </Menu>
                                <IconButton
                                  aria-label="View details"
                                  icon={<EditIcon />}
                                  size="xs"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedLead(lead);
                                    onDetailsOpen();
                                  }}
                                />
                                <IconButton
                                  aria-label="Delete"
                                  icon={<DeleteIcon />}
                                  size="xs"
                                  colorScheme="red"
                                  variant="outline"
                                  onClick={() => handleDeleteLead(lead.id)}
                                />
                              </HStack>
                            </VStack>
                          </CardBody>
                        </Card>
                      );
                    })}
                    {!leadsByStage[stage.id] || leadsByStage[stage.id].length === 0 ? (
                      <Text fontSize="sm" color="gray.400" textAlign="center" py={4}>
                        No leads
                      </Text>
                    ) : null}
                  </VStack>
                </Box>
              ))}
            </SimpleGrid>
          </TabPanel>

          {/* Lead List View */}
          <TabPanel>
            {loading ? (
              <Flex justify="center" p={6}>
                <Spinner />
              </Flex>
            ) : (
              <TableContainer border="1px solid" borderColor={borderColor} borderRadius="lg">
                <Table variant="simple" size="sm">
                  <Thead bg="gray.50">
                    <Tr>
                      <Th>Customer Name</Th>
                      <Th>Phone</Th>
                      <Th>Location</Th>
                      <Th>Source</Th>
                      <Th>Assigned To</Th>
                      <Th>Current Stage</Th>
                      <Th>Actions</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {leads.map((lead, __idx) => {
                      const person = getSalesPerson(lead.assigned_to);
                      const sourceObj = getSource(lead.source_id) || (lead.source && typeof lead.source !== 'string' ? lead.source : undefined);
                      const sourceText: string = sourceObj ? `${(sourceObj as LeadSource).icon} ${(sourceObj as LeadSource).name}` : (typeof lead.source === 'string' && lead.source) ? lead.source : (lead.source_id ? String(lead.source_id) : '—');
                      const pipeline = getPipeline(lead.id);
                      const stage = getStage(pipeline?.current_stage_id);
                      const _key = lead.id || `${lead.customer_email || lead.customer_phone || 'lead'}-${__idx}`;

                      return (
                        <Tr key={_key}>
                          <Td fontWeight="medium">{lead.customer_name}</Td>
                          <Td>{lead.customer_phone || '—'}</Td>
                          <Td>{lead.location || '—'}</Td>
                          <Td>{sourceText}</Td>
                          <Td>{person ? person.name : <Badge colorScheme="orange">Unassigned</Badge>}</Td>
                          <Td>{stage ? <Badge colorScheme="green">{stage.name}</Badge> : '—'}</Td>
                          <Td>
                            <HStack spacing={2}>
                              <IconButton
                                aria-label="View details"
                                icon={<EditIcon />}
                                size="xs"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedLead(lead);
                                  onDetailsOpen();
                                }}
                              />
                              <IconButton
                                aria-label="Delete"
                                icon={<DeleteIcon />}
                                size="xs"
                                colorScheme="red"
                                variant="ghost"
                                onClick={() => handleDeleteLead(lead.id)}
                              />
                            </HStack>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </TableContainer>
            )}
          </TabPanel>

          {/* Sales Persons View */}
          <TabPanel>
            <TableContainer border="1px solid" borderColor={borderColor} borderRadius="lg">
              <Table variant="simple" size="sm">
                <Thead bg="gray.50">
                  <Tr>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Phone</Th>
                    <Th>Leads Assigned</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {salesPersons.map((person) => {
                    const assignedLeads = leads.filter((l) => l.assigned_to === person.id);
                    return (
                      <Tr key={person.id}>
                        <Td fontWeight="medium">{person.name}</Td>
                        <Td>{person.email || '—'}</Td>
                        <Td>{person.phone || '—'}</Td>
                        <Td>{assignedLeads.length}</Td>
                        <Td>
                          <Badge colorScheme={person.status === 'active' ? 'green' : 'red'}>
                            {person.status}
                          </Badge>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </TableContainer>
          </TabPanel>
          {/* Add Lead Tab */}
          <TabPanel>
            <Box bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="lg" p={4}>
              <VStack spacing={4} align="stretch">
                <FormControl isRequired>
                  <FormLabel>Customer Name</FormLabel>
                  <Input
                    placeholder="Enter customer name"
                    value={newLeadData.customer_name}
                    onChange={(e) => setNewLeadData({ ...newLeadData, customer_name: e.target.value })}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Phone</FormLabel>
                  <Input
                    placeholder="Enter phone number"
                    value={newLeadData.customer_phone}
                    onChange={(e) => setNewLeadData({ ...newLeadData, customer_phone: e.target.value })}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Email</FormLabel>
                  <Input
                    placeholder="Enter email"
                    type="email"
                    value={newLeadData.customer_email}
                    onChange={(e) => setNewLeadData({ ...newLeadData, customer_email: e.target.value })}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Location</FormLabel>
                  <Input
                    placeholder="Enter location"
                    value={newLeadData.location}
                    onChange={(e) => setNewLeadData({ ...newLeadData, location: e.target.value })}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Lead Source</FormLabel>
                  <Select
                    value={newLeadData.source_id}
                    onChange={(e) => setNewLeadData({ ...newLeadData, source_id: e.target.value })}
                  >
                    <option value="">Select source</option>
                    {sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.icon} {source.name}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel>Assign To Sales Person</FormLabel>
                  <Select
                    value={newLeadData.assigned_to}
                    onChange={(e) => setNewLeadData({ ...newLeadData, assigned_to: e.target.value })}
                  >
                    <option value="">Select sales person</option>
                    {salesPersons.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <HStack>
                  <Button colorScheme="green" onClick={handleAddLead}>Add Lead</Button>
                </HStack>
              </VStack>
            </Box>
          </TabPanel>

          {/* Assign Leads Tab */}
          <TabPanel>
            <TableContainer border="1px solid" borderColor={borderColor} borderRadius="lg">
              <Table variant="simple" size="sm">
                <Thead bg="gray.50">
                  <Tr>
                    <Th>Customer</Th>
                    <Th>Assign To</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {leads.map((lead, __idx) => {
                    const _key = lead.id || `${lead.customer_email || lead.customer_phone || 'lead'}-${__idx}`;
                    return (
                      <Tr key={_key}>
                        <Td fontWeight="medium">{lead.customer_name}</Td>
                        <Td>
                          <Select
                            value={lead.assigned_to || ''}
                            placeholder="Select sales person"
                            onChange={(e) => handleAssignLead(lead.id, e.target.value)}
                          >
                            {salesPersons.map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.name}
                              </option>
                            ))}
                          </Select>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </TableContainer>
          </TabPanel>

          {/* Lead Sources Tab */}
          <TabPanel>
            <VStack spacing={6} align="stretch">
              <Box bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="lg" p={4}>
                <Heading size="sm" color="green.600" mb={3}>Add Lead Source</Heading>
                <VStack spacing={4} align="stretch">
                  <FormControl isRequired>
                    <FormLabel>Name</FormLabel>
                    <Input
                      placeholder="Enter source name"
                      value={newSourceData.name}
                      onChange={(e) => setNewSourceData({ ...newSourceData, name: e.target.value })}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Icon</FormLabel>
                    <Input
                      placeholder="e.g. 📣"
                      value={newSourceData.icon}
                      onChange={(e) => setNewSourceData({ ...newSourceData, icon: e.target.value })}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Color</FormLabel>
                    <Input
                      placeholder="e.g. green, blue"
                      value={newSourceData.color}
                      onChange={(e) => setNewSourceData({ ...newSourceData, color: e.target.value })}
                    />
                  </FormControl>
                  <Button colorScheme="green" onClick={handleAddSource}>Add Source</Button>
                </VStack>
              </Box>

              <TableContainer border="1px solid" borderColor={borderColor} borderRadius="lg">
                <Table variant="simple" size="sm">
                  <Thead bg="gray.50">
                    <Tr>
                      <Th>Name</Th>
                      <Th>Icon</Th>
                      <Th>Color</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {sources.map((source) => (
                      <Tr key={source.id}>
                        <Td fontWeight="medium">{source.name}</Td>
                        <Td>{source.icon || '—'}</Td>
                        <Td>{source.color || '—'}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableContainer>
            </VStack>
          </TabPanel>

          {/* Add Sales Person Tab */}
          <TabPanel>
            <Box bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="lg" p={4}>
              <VStack spacing={4} align="stretch">
                <FormControl isRequired>
                  <FormLabel>Name</FormLabel>
                  <Input
                    placeholder="Enter name"
                    value={newPersonData.name}
                    onChange={(e) => setNewPersonData({ ...newPersonData, name: e.target.value })}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Email</FormLabel>
                  <Input
                    placeholder="Enter email"
                    type="email"
                    value={newPersonData.email}
                    onChange={(e) => setNewPersonData({ ...newPersonData, email: e.target.value })}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Phone</FormLabel>
                  <Input
                    placeholder="Enter phone"
                    value={newPersonData.phone}
                    onChange={(e) => setNewPersonData({ ...newPersonData, phone: e.target.value })}
                  />
                </FormControl>
                <HStack>
                  <Button colorScheme="purple" onClick={handleAddPerson}>Add Person</Button>
                </HStack>
              </VStack>
            </Box>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Add Lead Modal */}
      <Modal isOpen={isAddLeadOpen} onClose={onAddLeadClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add New Lead</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Customer Name</FormLabel>
                <Input
                  placeholder="Enter customer name"
                  value={newLeadData.customer_name}
                  onChange={(e) => setNewLeadData({ ...newLeadData, customer_name: e.target.value })}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Phone</FormLabel>
                <Input
                  placeholder="Enter phone number"
                  value={newLeadData.customer_phone}
                  onChange={(e) => setNewLeadData({ ...newLeadData, customer_phone: e.target.value })}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Email</FormLabel>
                <Input
                  placeholder="Enter email"
                  type="email"
                  value={newLeadData.customer_email}
                  onChange={(e) => setNewLeadData({ ...newLeadData, customer_email: e.target.value })}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Location</FormLabel>
                <Input
                  placeholder="Enter location"
                  value={newLeadData.location}
                  onChange={(e) => setNewLeadData({ ...newLeadData, location: e.target.value })}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Lead Source</FormLabel>
                <Select
                  value={newLeadData.source_id}
                  onChange={(e) => setNewLeadData({ ...newLeadData, source_id: e.target.value })}
                >
                  <option value="">Select source</option>
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.icon} {source.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Assign To Sales Person</FormLabel>
                <Select
                  value={newLeadData.assigned_to}
                  onChange={(e) => setNewLeadData({ ...newLeadData, assigned_to: e.target.value })}
                >
                  <option value="">Select sales person</option>
                  {salesPersons.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onAddLeadClose}>
              Cancel
            </Button>
            <Button colorScheme="green" onClick={handleAddLead}>
              Add Lead
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Add Sales Person Modal */}
      <Modal isOpen={isAddPersonOpen} onClose={onAddPersonClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add Sales Person</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <Input
                  placeholder="Enter name"
                  value={newPersonData.name}
                  onChange={(e) => setNewPersonData({ ...newPersonData, name: e.target.value })}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Email</FormLabel>
                <Input
                  placeholder="Enter email"
                  type="email"
                  value={newPersonData.email}
                  onChange={(e) => setNewPersonData({ ...newPersonData, email: e.target.value })}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Phone</FormLabel>
                <Input
                  placeholder="Enter phone"
                  value={newPersonData.phone}
                  onChange={(e) => setNewPersonData({ ...newPersonData, phone: e.target.value })}
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onAddPersonClose}>
              Cancel
            </Button>
            <Button colorScheme="purple" onClick={handleAddPerson}>
              Add Person
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Lead Details Modal */}
      <Modal isOpen={isDetailsOpen} onClose={onDetailsClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Lead Details</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedLead && (
              <VStack spacing={4} align="start">
                <Box>
                  <Text fontSize="sm" color="gray.500">Customer Name</Text>
                  <Text fontWeight="medium">{selectedLead.customer_name}</Text>
                </Box>
                <Box>
                  <Text fontSize="sm" color="gray.500">Phone</Text>
                  <Text fontWeight="medium">{selectedLead.customer_phone || '—'}</Text>
                </Box>
                <Box>
                  <Text fontSize="sm" color="gray.500">Email</Text>
                  <Text fontWeight="medium">{selectedLead.customer_email || '—'}</Text>
                </Box>
                <Box>
                  <Text fontSize="sm" color="gray.500">Location</Text>
                  <Text fontWeight="medium">{selectedLead.location || '—'}</Text>
                </Box>
                {(() => {
                  const sourceObj = getSource(selectedLead.source_id) || (selectedLead.source && typeof selectedLead.source !== 'string' ? selectedLead.source : undefined);
                  const sourceText: string | null = sourceObj ? `${(sourceObj as LeadSource).icon} ${(sourceObj as LeadSource).name}` : (typeof selectedLead.source === 'string' && selectedLead.source) ? selectedLead.source : (selectedLead.source_id ? String(selectedLead.source_id) : null);
                  return sourceText ? (
                    <Box>
                      <Text fontSize="sm" color="gray.500">Lead Source</Text>
                      <Text fontWeight="medium">{sourceText}</Text>
                    </Box>
                  ) : null;
                })()}
                {(() => {
                  const person = getSalesPerson(selectedLead.assigned_to);
                  return (
                    <Box>
                      <Text fontSize="sm" color="gray.500">Assigned To</Text>
                      <Text fontWeight="medium">{person ? person.name : 'Unassigned'}</Text>
                    </Box>
                  );
                })()}
                {(() => {
                  const pipeline = getPipeline(selectedLead.id);
                  const stage = getStage(pipeline?.current_stage_id);
                  return stage ? (
                    <Box>
                      <Text fontSize="sm" color="gray.500">Current Stage</Text>
                      <Badge colorScheme="green">{stage.name}</Badge>
                    </Box>
                  ) : null;
                })()}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="green" onClick={onDetailsClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default Sales;
