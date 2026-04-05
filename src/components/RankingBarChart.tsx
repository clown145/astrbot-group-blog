import { useEffect, useRef, type ReactElement } from "react";

type RankingItem = {
  label: string;
  value: number;
  detail?: string;
};

type RankingBarChartProps = {
  items: RankingItem[];
  heightClassName?: string;
};

export default function RankingBarChart({
  items,
  heightClassName = "h-[300px] sm:h-[360px]",
}: RankingBarChartProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = rootRef.current;
    if (!target || !items.length) {
      return;
    }

    let disposed = false;
    let chart: import("echarts").ECharts | null = null;
    let resizeObserver: ResizeObserver | null = null;

    void (async () => {
      const echarts = await import("echarts");
      if (disposed || !rootRef.current) {
        return;
      }

      chart = echarts.init(rootRef.current);
      chart.setOption({
        animationDuration: 650,
        backgroundColor: "transparent",
        grid: {
          left: 16,
          right: 16,
          top: 12,
          bottom: 20,
          containLabel: true,
        },
        tooltip: {
          trigger: "axis",
          axisPointer: {
            type: "shadow",
          },
          backgroundColor: "rgba(31, 42, 36, 0.92)",
          borderWidth: 0,
          textStyle: {
            color: "#f6f1e7",
          },
          formatter: (params: Array<{ dataIndex: number; value: number }>) => {
            const index = params[0]?.dataIndex ?? 0;
            const item = items[index];
            if (!item) {
              return "";
            }
            return item.detail
              ? `${item.label}<br/>${item.detail}`
              : `${item.label}<br/>值：${params[0]?.value ?? item.value}`;
          },
        },
        xAxis: {
          type: "value",
          splitLine: {
            lineStyle: {
              color: "rgba(31, 42, 36, 0.08)",
            },
          },
          axisLabel: {
            color: "#5f675f",
            fontSize: 11,
          },
        },
        yAxis: {
          type: "category",
          data: items.map((item) => item.label),
          axisLabel: {
            color: "#5f675f",
            fontSize: 11,
            width: 88,
            overflow: "truncate",
          },
          axisLine: {
            lineStyle: {
              color: "rgba(31, 42, 36, 0.18)",
            },
          },
        },
        series: [
          {
            type: "bar",
            data: items.map((item) => item.value),
            barMaxWidth: 18,
            itemStyle: {
              borderRadius: [0, 8, 8, 0],
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 1,
                y2: 0,
                colorStops: [
                  { offset: 0, color: "#d2764b" },
                  { offset: 1, color: "#1e6f5c" },
                ],
              },
            },
          },
        ],
      });

      resizeObserver = new ResizeObserver(() => {
        chart?.resize();
      });
      resizeObserver.observe(rootRef.current);
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      chart?.dispose();
    };
  }, [items]);

  return <div ref={rootRef} className={`w-full ${heightClassName}`} />;
}
