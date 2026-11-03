'use client';
import { theme } from 'antd';

// Recharts colors from the tokens of the current theme
export default function useChartTheme() {
  const { token } = theme.useToken();
  return {
    surface: token.colorBgContainer,
    text: token.colorText,
    grid: token.colorBorderSecondary,
    axisText: token.colorTextSecondary,
    cursor: token.colorFillTertiary,
    tooltip: {
      contentStyle: {
        background: token.colorBgElevated,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius
      },
      labelStyle: { color: token.colorText }
    }
  };
}
