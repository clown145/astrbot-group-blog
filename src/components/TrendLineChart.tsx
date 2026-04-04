import { useEffect, useRef, type ReactElement } from "react";

type TrendPoint = {
  snapshot_date: string | null;
  message_count: number;
  participant_count: number;
  active_user_count: number;
};

type TrendLineChartProps = {
  points: TrendPoint[];
};

export default function TrendLineChart({
  points,
}: TrendLineChartProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = rootRef.current;
    if (!target || !points.length) {
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

      const labels = points.map((point) => point.snapshot_date ?? "未定");
      chart = echarts.init(rootRef.current);
      chart.setOption({
        animationDuration: 700,
        backgroundColor: "transparent",
        grid: {
          left: 16,
          right: 20,
          top: 28,
          bottom: 20,
          containLabel: true,
        },
        tooltip: {
          trigger: "axis",
          backgroundColor: "rgba(31, 42, 36, 0.92)",
          borderWidth: 0,
          textStyle: {
            color: "#f6f1e7",
          },
        },
        xAxis: {
          type: "category",
          boundaryGap: false,
          data: labels,
          axisLine: {
            lineStyle: {
              color: "rgba(31, 42, 36, 0.18)",
            },
          },
          axisLabel: {
            color: "#5f675f",
            fontSize: 11,
          },
        },
        yAxis: {
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
        series: [
          {
            name: "消息数",
            type: "line",
            smooth: 0.3,
            data: points.map((point) => point.message_count),
            symbol: "circle",
            symbolSize: 8,
            lineStyle: {
              width: 3,
              color: "#1e6f5c",
            },
            itemStyle: {
              color: "#1e6f5c",
              borderColor: "#f6f1e7",
              borderWidth: 2,
            },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(30, 111, 92, 0.28)" },
                  { offset: 1, color: "rgba(30, 111, 92, 0.02)" },
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
  }, [points]);

  return <div ref={rootRef} className="h-[280px] w-full" />;
}
