import { use } from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import VChart from 'vue-echarts';

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  TooltipComponent,
  LegendComponent,
  GridComponent,
]);

export { VChart };