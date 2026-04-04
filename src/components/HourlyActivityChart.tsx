import { useEffect, useRef, type ReactElement } from "react";

type HourlyBucket = {
  hour?: number;
  message_count?: number;
};

type HourlyActivityChartProps = {
  buckets: HourlyBucket[];
};

export default function HourlyActivityChart({
  buckets,
}: HourlyActivityChartProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = rootRef.current;
    if (!target || !buckets.length) {
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
        animationDuration: 700,
        backgroundColor: "transparent",
        grid: {
          left: 16,
          right: 16,
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
          data: buckets.map((bucket) =>
            String(bucket.hour ?? 0).padStart(2, "0"),
          ),
          axisLabel: {
            color: "#5f675f",
            fontSize: 11,
          },
          axisLine: {
            lineStyle: {
              color: "rgba(31, 42, 36, 0.18)",
            },
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
            type: "bar",
            data: buckets.map((bucket) => bucket.message_count ?? 0),
            barMaxWidth: 18,
            itemStyle: {
              borderRadius: [8, 8, 0, 0],
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "#9d4b2e" },
                  { offset: 1, color: "#f0b18e" },
                ],
              },
            },
            emphasis: {
              itemStyle: {
                color: "#c35d38",
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
  }, [buckets]);

  return <div ref={rootRef} className="h-[280px] w-full" />;
}
