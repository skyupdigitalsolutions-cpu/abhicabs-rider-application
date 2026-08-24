/**
 * src/features/booking/screens/PlaceSearchScreen.tsx
 *
 * Search-and-select for one end of the trip. The user types, we debounce, hit
 * the backend autocomplete, and show results. On tap we geocode the chosen
 * suggestion (autocomplete carries no coordinates), write it into the booking
 * draft as pickup or drop, and pop back.
 *
 * States handled explicitly (design guidance — emptiness and failure are
 * direction, not mood): too-short query prompts what to do; no matches says so
 * plainly; a failed search offers a retry; a slow geocode shows the tapped row
 * as busy so the tap never feels ignored.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useBookingDraft } from '../../../store/bookingDraft';
import { DEFAULT_CITY } from '../../../config/catalog';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import { usePlaceSearch, resolveSuggestion } from '../api';
import { AbhiApiError } from '../../../types/api';
import type { PlaceSearchScreenProps } from '../../../navigation/types';
import type { PlaceSuggestion } from '../../../types/domain';
import { colors, radius, spacing, type } from '../../../theme';

export function PlaceSearchScreen({ route, navigation }: PlaceSearchScreenProps) {
  const { field } = route.params;
  const setPickup = useBookingDraft((s) => s.setPickup);
  const setDrop = useBookingDraft((s) => s.setDrop);

  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term, 300);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Bias autocomplete toward the active city's centre for more relevant hits.
  const search = usePlaceSearch(debounced, DEFAULT_CITY.center);

  async function onSelect(s: PlaceSuggestion) {
    setResolveError(null);
    setResolvingId(s.placeId);
    try {
      const place = await resolveSuggestion(s);
      if (field === 'pickup') setPickup(place);
      else setDrop(place);
      navigation.goBack();
    } catch (err) {
      setResolvingId(null);
      setResolveError(
        err instanceof AbhiApiError && err.isNetwork
          ? 'No connection. Check your network and try again.'
          : "Couldn't pin that place. Try another result.",
      );
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={term}
          onChangeText={setTerm}
          placeholder={field === 'pickup' ? 'Search pickup point' : 'Search destination'}
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="search"
        />
        {term.length > 0 ? (
          <Pressable onPress={() => setTerm('')} hitSlop={8}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <SearchBody
        term={term}
        debounced={debounced}
        search={search}
        resolvingId={resolvingId}
        resolveError={resolveError}
        onSelect={onSelect}
        onRetry={() => search.refetch()}
      />
    </View>
  );
}

function SearchBody(props: {
  term: string;
  debounced: string;
  search: ReturnType<typeof usePlaceSearch>;
  resolvingId: string | null;
  resolveError: string | null;
  onSelect: (s: PlaceSuggestion) => void;
  onRetry: () => void;
}) {
  const { search, term } = props;

  // Below the 3-char minimum: tell the user what to do.
  if (term.trim().length < 3) {
    return <Hint text="Type at least 3 letters to search." />;
  }

  if (search.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (search.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Search failed. Check your connection.</Text>
        <Pressable style={styles.retry} onPress={props.onRetry}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const results = search.data ?? [];
  if (results.length === 0) {
    return <Hint text={`No places match "${props.debounced}". Try a nearby landmark.`} />;
  }

  return (
    <>
      {props.resolveError ? <Text style={styles.inlineError}>{props.resolveError}</Text> : null}
      <FlatList
        data={results}
        keyExtractor={(s: PlaceSuggestion) => s.placeId}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }: { item: PlaceSuggestion }) => {
          const busy = props.resolvingId === item.placeId;
          return (
            <Pressable
              style={styles.result}
              onPress={() => props.onSelect(item)}
              disabled={busy}
            >
              <View style={styles.pin} />
              <Text style={styles.resultText} numberOfLines={2}>
                {item.description}
              </Text>
              {busy ? <ActivityIndicator color={colors.textMuted} /> : null}
            </Pressable>
          );
        }}
      />
    </>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.hint}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  input: { ...type.body, color: colors.text, flex: 1, paddingVertical: spacing.lg },
  clear: { ...type.label, color: colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  hint: { ...type.body, color: colors.textMuted, textAlign: 'center' },
  errorText: { ...type.body, color: colors.danger, textAlign: 'center' },
  retry: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  retryText: { ...type.label, color: colors.text },
  inlineError: { ...type.caption, color: colors.danger, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pin: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted },
  resultText: { ...type.body, color: colors.text, flex: 1 },
});