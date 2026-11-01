'use client';
import { Typography } from 'antd';
import { AutocompleteMatch, AutocompleteResult } from '../../types';

const { Text } = Typography;

const ellipsis = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
} as const;

// The value with the parts the search term matched marked
const Highlighted = ({
  value,
  match
}: {
  value: string;
  match?: AutocompleteMatch;
}) => {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const [start, end] of match?.ranges ?? []) {
    if (start > last) parts.push(value.slice(last, start));
    parts.push(
      <Text mark key={start}>
        {value.slice(start, end)}
      </Text>
    );
    last = end;
  }
  parts.push(value.slice(last));
  return <>{parts}</>;
};

// A product in the autocomplete list, showing what the term matched in its
// name and sku
export default function AutocompleteOption({
  result,
  storeName
}: {
  result: AutocompleteResult;
  storeName?: string;
}) {
  const matchOf = (field: AutocompleteMatch['field']) =>
    result.matches.find((match) => match.field === field);
  return (
    <div title={result.name}>
      <div style={ellipsis}>
        <Highlighted value={result.name} match={matchOf('name')} />
      </div>
      <Text
        type="secondary"
        style={{ ...ellipsis, display: 'block', fontSize: 12 }}
      >
        Vörunúmer <Highlighted value={result.sku} match={matchOf('sku')} />
        {storeName && ` · ${storeName}`}
      </Text>
    </div>
  );
}
