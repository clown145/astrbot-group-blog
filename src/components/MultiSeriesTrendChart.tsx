import { useEffect, useRef, type ReactElement } from "react";

type SeriesPoint = {
  name: string;
  data: number[];
  color: string;
};

type MultiSeriesTrendChartProps = {
  labels: string[];
  series: SeriesPoint[];
  heightClassName?: string;
};

export default function MultiSeriesTrendChart({
  labels,
  series,
  heightClassName = "h-[280px] sm:h-[320px]",
}: MultiSeriesTrendChartProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = rootRef.current;
    if (!target || !labels.length || !series.length) {
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
          right: 20,
          top: 46,
          bottom: 20,
          containLabel: true,
        },
        legend: {
          top: 4,
          textStyle: {
            color: "#5f675f",
            fontSize: 11,
          },
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
        series: series.map((item, index) => ({
          name: item.name,
          type: "line",
          smooth: 0.25,
          data: item.data,
          symbol: "circle",
          symbolSize: 7,
          lineStyle: {
            width: 3,
            color: item.color,
          },
          itemStyle: {
            color: item.color,
            borderColor: "#f6f1e7",
            borderWidth: 2,
          },
          areaStyle:
            index === 0
              ? {
                  color: {
                    type: "linear",
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: "rgba(30, 111, 92, 0.2)" },
                      { offset: 1, color: "rgba(30, 111, 92, 0.02)" },
                    ],
                  },
                }
              : undefined,
        })),
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
  }, [labels, series]);

  return <div ref={rootRef} className={`w-full ${heightClassName}`} />;
}
