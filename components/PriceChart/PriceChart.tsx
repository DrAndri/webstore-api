import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { PriceChartProps } from '../../types';
import dayjs from 'dayjs';

export default function PriceChart({ prices }: PriceChartProps) {
  const colors = [
    '#c10000',
    '#c15b00',
    '#c1ae00',
    '#5dc100',
    '#00c184',
    '#003ac1',
    '#7800c1',
    '#c100ab',
    '#000000',
    '#525252',
    '#003fff',
    '#ff0000',
    '#ff00fb',
    '#27ff00'
  ];

  const nameToColor = (name: string) => {
    const hash = hashStr(name);
    const index = hash % colors.length;
    return colors[index];
  };

  function hashStr(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      hash += charCode;
    }
    return hash;
  }

  const getRechartLines = () => {
    if (!prices) return null;
    const entries = prices.map((option) => {
      const keys = Object.keys(option);
      return keys;
    });
    const flattened = entries.reduce((prev, current) => {
      prev = prev.concat(current);
      return prev;
    }, []);
    const filtered = flattened.filter((key) => key !== 'timestamp');
    const uniqueKeys = [...new Set(filtered)];
    return uniqueKeys.map((key) => {
      const isSalePrice = key.includes('salePrice');
      return (
        <Line
          key={key}
          type="stepAfter"
          dot={false}
          stroke={nameToColor(key.substring(0, key.lastIndexOf(' - ')))}
          strokeWidth={2}
          strokeDasharray={isSalePrice ? '4 2' : '0'}
          dataKey={key}
        />
      );
    });
  };

  const everyMonthInRange = () => {
    let lowestTimestamp = prices[0].timestamp;
    let highestTimestamp = prices[prices.length - 1].timestamp;
    for (const price of prices) {
      if (price.timestamp < lowestTimestamp) lowestTimestamp = price.timestamp;
      if (price.timestamp > highestTimestamp)
        highestTimestamp = price.timestamp;
    }

    const timestamps = [];
    const lowest = dayjs.unix(lowestTimestamp);
    const highest = dayjs.unix(highestTimestamp);
    const firstOfLowest = lowest.startOf('month').unix();
    timestamps.push(firstOfLowest);
    let next = dayjs.unix(timestamps[timestamps.length - 1]).add(1, 'month');
    while (next.isBefore(highest)) {
      timestamps.push(next.unix());
      next = next.add(1, 'month');
    }
    return timestamps;
  };

  const formatPrice = (number: number) =>
    number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (prices.length > 0) {
    return (
      <ResponsiveContainer height={'99%'} width={'100%'}>
        <LineChart
          data={prices}
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={['dataMin - 500000', 'dataMax']}
            ticks={everyMonthInRange()}
            tickFormatter={(value: number) => {
              const date = dayjs.unix(value);
              return date.format('MMM-YYYY');
            }}
          />
          <YAxis
            width={90}
            tickFormatter={(value: number) => formatPrice(value)}
            domain={[
              (dataMin: number) => Math.floor(dataMin / 10000) * 10000,
              (dataMax: number) => Math.ceil(dataMax / 10000) * 10000
            ]}
          />
          <Tooltip
            labelFormatter={(label: any) =>
              dayjs.unix(label).format('DD-MMM-YYYY')
            }
            labelStyle={{ fontWeight: 'bold' }}
            formatter={(value: number | undefined) =>
              value && formatPrice(value) + ' kr.'
            }
          />
          <CartesianGrid stroke="#c2c2c2" strokeDasharray="3 3" />
          <Legend
            wrapperStyle={{ paddingBottom: 20 }}
            align="center"
            verticalAlign="top"
          />
          {getRechartLines()}
        </LineChart>
      </ResponsiveContainer>
    );
  } else return null;
}
