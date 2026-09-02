import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  listMyIssueReports,
  REPORT_STATUS_LABELS,
  submitIssueReport,
  type IssueKind,
  type IssueReport,
} from '@/domains/reporting/service';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { queryKeys } from '@/lib/queryKeys';
import { colors } from '@/lib/theme';

const KIND_OPTIONS: { value: IssueKind; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'content', label: 'Content' },
  { value: 'other', label: 'Other' },
];

const KIND_LABELS: Record<string, string> = {
  bug: 'Bug',
  content: 'Content',
  other: 'Other',
};

export default function ReportIssueScreen() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<IssueKind>('bug');
  const [description, setDescription] = useState('');
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const reportsQuery = useQuery({ queryKey: queryKeys.issueReports, queryFn: listMyIssueReports });
  const insets = useSafeAreaInsets();

  const submitMutation = useMutation({
    mutationFn: () =>
      submitIssueReport({
        kind,
        description,
        context: { platform: Platform.OS, surface: 'report-issue' },
      }),
    onSuccess: () => {
      setDescription('');
      setConfirmation('Thanks — your report is in. You can track its status below.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.issueReports });
    },
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Report an issue' }} />

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>What went wrong?</Text>
        <View style={styles.kindRow}>
          {KIND_OPTIONS.map((option) => {
            const selected = option.value === kind;
            return (
              <Pressable
                key={option.value}
                style={[styles.kindOption, selected && styles.kindOptionSelected]}
                onPress={() => setKind(option.value)}
              >
                <Text style={[styles.kindOptionText, selected && styles.kindOptionTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          style={styles.input}
          placeholder="Describe the problem — what you did, what you expected, what happened."
          placeholderTextColor={colors.muted}
          value={description}
          onChangeText={(value) => {
            setDescription(value);
            if (confirmation) {
              setConfirmation(null);
            }
          }}
          multiline
          textAlignVertical="top"
        />
        {submitMutation.isError ? (
          <Text style={styles.error}>
            {submitMutation.error instanceof Error
              ? submitMutation.error.message
              : 'Could not send the report.'}
          </Text>
        ) : null}
        {confirmation ? <Text style={styles.success}>{confirmation}</Text> : null}
        <Pressable
          style={[styles.primaryButton, submitMutation.isPending && styles.buttonDisabled]}
          onPress={() => submitMutation.mutate()}
          disabled={submitMutation.isPending}
        >
          <Text style={styles.primaryButtonText}>
            {submitMutation.isPending ? 'Sending…' : 'Send report'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Your reports</Text>
      {reportsQuery.isPending ? (
        <LoadingState label="Loading your reports…" />
      ) : reportsQuery.isError ? (
        <ErrorState
          error={reportsQuery.error}
          fallback="Could not load your reports."
          onRetry={() => void reportsQuery.refetch()}
        />
      ) : reportsQuery.data.length === 0 ? (
        <EmptyState message="No reports yet." />
      ) : (
        <FlatList
          data={reportsQuery.data}
          keyExtractor={(report) => String(report.id)}
          renderItem={({ item }) => <ReportCard report={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function ReportCard({ report }: { report: IssueReport }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardKind}>{KIND_LABELS[report.kind] ?? report.kind}</Text>
        <View style={styles.statusChip}>
          <Text style={styles.statusChipText}>
            {REPORT_STATUS_LABELS[report.status] ?? report.status}
          </Text>
        </View>
      </View>
      <Text style={styles.cardText}>{report.description}</Text>
      <Text style={styles.cardDate}>{new Date(report.created_at).toLocaleString()}</Text>
      {report.resolution_notes ? (
        <Text style={styles.resolutionNotes}>Resolution: {report.resolution_notes}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  formCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  formTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  kindRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  kindOption: {
    flex: 1,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  kindOptionSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  kindOptionText: {
    color: colors.text,
    fontWeight: '600',
  },
  kindOptionTextSelected: {
    color: colors.background,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.text,
    padding: 10,
    minHeight: 100,
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardKind: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusChip: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  cardText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  cardDate: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
  },
  resolutionNotes: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 6,
    fontStyle: 'italic',
  },
  error: {
    color: colors.danger,
    marginBottom: 8,
  },
  success: {
    color: colors.accent,
    marginBottom: 8,
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  loader: {
    marginTop: 16,
  },
});
