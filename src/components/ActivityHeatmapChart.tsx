import { useEffect, useRef, type ReactElement } from "react";

type HeatmapCell = {
  date: string;
  hour: number;
  message_count: number;
};

type ActivityHeatmapChartProps = {
  cells: HeatmapCell[];
  heightClassName?: string;
};

export default function ActivityHeatmapChart({
  cells,
  heightClassName = "h-[320px] sm:h-[420px]",
}: ActivityHeatmapChartProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = rootRef.current;
    if (!target || !cells.length) {
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

      const dates = Array.from(new Set(cells.map((cell) => cell.date)));
      const hourLabels = Array.from({ length: 24 }, (_, hour) =>
        String(hour).padStart(2, "0"),
      );
      const maxValue = Math.max(1, ...cells.map((cell) => cell.message_count));
      const seriesData = cells.map((cell) => [
        cell.hour,
        dates.indexOf(cell.date),
        cell.message_count,
      ]);

      chart = echarts.init(rootRef.current);
      chart.setOption({
        animationDuration: 600,
        backgroundColor: "transparent",
        grid: {
          left: 16,
          right: 16,
          top: 20,
          bottom: 56,
          containLabel: true,
        },
        tooltip: {
          position: "top",
          backgroundColor: "rgba(31, 42, 36, 0.92)",
          borderWidth: 0,
          textStyle: {
            color: "#f6f1e7",
          },
          formatter: (params: { data?: [number, number, number] }) => {
            const data = params.data;
            if (!data) {
              return "";
            }
            const [hourIndex, dateIndex, value] = data;
            return `${dates[dateIndex]} ${hourLabels[hourIndex]}:00<br/>消息数：${value}`;
          },
        },
        xAxis: {
          type: "category",
          data: hourLabels,
          splitArea: {
            show: true,
          },
          axisLine: {
            lineStyle: {
              color: "rgba(31, 42, 36, 0.18)",
            },
          },
          axisLabel: {
            color: "#5f675f",
            fontSize: 10,
            interval: 2,
          },
        },
        yAxis: {
          type: "category",
          data: dates,
          splitArea: {
            show: true,
          },
          axisLine: {
            lineStyle: {
              color: "rgba(31, 42, 36, 0.18)",
            },
          },
          axisLabel: {
            color: "#5f675f",
            fontSize: 10,
          },
        },
        visualMap: {
          min: 0,
          max: maxValue,
          calculable: false,
          orient: "horizontal",
          left: "center",
          bottom: 8,
          textStyle: {
            color: "#5f675f",
            fontSize: 10,
          },
          inRange: {
            color: ["#f3ead7", "#f2b38f", "#d2764b", "#8e3d23"],
          },
        },
        series: [
          {
            name: "活跃热力图",
            type: "heatmap",
            data: seriesData,
            label: {
              show: false,
            },
            emphasis: {
              itemStyle: {
                shadowBlur: 8,
                shadowColor: "rgba(31, 42, 36, 0.18)",
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
  }, [cells]);

  return <div ref={rootRef} className={`w-full ${heightClassName}`} />;
}
