import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, BarChart3, PieChart, MapPin, Activity, AlertTriangle, Loader2 } from 'lucide-react';
import apiClient from '../utils/axios';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const COLORS = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22'];

export default function AnalyticsDashboard() {
  const [trends, setTrends] = useState([]);
  const [distribution, setDistribution] = useState([]);
  const [stats, setStats] = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(30);
  const [interval, setInterval] = useState('day');

  useEffect(() => {
    fetchAnalyticsData();
  }, [timeRange, interval]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [trendsRes, distributionRes, statsRes, heatmapRes] = await Promise.all([
        apiClient.get(`/api/analytics/trends?days=${timeRange}&interval=${interval}`),
        apiClient.get(`/api/analytics/distribution?days=${timeRange}`),
        apiClient.get('/api/analytics/stats'),
        apiClient.get(`/api/analytics/heatmap?days=${timeRange}&limit=500`)
      ]);

      setTrends(trendsRes.data);
      setDistribution(distributionRes.data);
      setStats(statsRes.data);
      setHeatmap(heatmapRes.data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  // Format trends data for chart
  const formatTrendsData = () => {
    return trends.map(item => ({
      date: new Date(item.time_period).toLocaleDateString(),
      count: item.count,
      uniqueTypes: item.unique_types
    }));
  };

  // Format distribution data for pie chart
  const formatDistributionData = () => {
    return distribution.map(item => ({
      name: item.hazard_type || 'Unknown',
      value: item.count,
      avgConfidence: item.avg_confidence ? (item.avg_confidence * 100).toFixed(1) : 0,
      driverLane: item.driver_lane_count || 0
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-[#3498db] animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-[#e74c3c] mx-auto mb-4" />
          <p className="text-white text-lg mb-4">{error}</p>
          <button
            onClick={fetchAnalyticsData}
            className="px-6 py-2 bg-[#3498db] text-white rounded-full font-semibold hover:bg-[#2980b9] transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]"
    >
      {/* Header */}
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-white/10 backdrop-blur-lg border-b border-white/20"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/">
            <motion.button
              whileHover={{ scale: 1.05, x: -5 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 text-white hover:text-[#3498db] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold">Back to Home</span>
            </motion.button>
          </Link>

          <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-3">
            <TrendingUp className="text-[#3498db] w-7 h-7" />
            Analytics Dashboard
          </h1>

          <div className="flex items-center gap-2">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(Number(e.target.value))}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#3498db]"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#3498db]"
            >
              <option value="hour">Hourly</option>
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
            </select>
          </div>
        </div>
      </motion.div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Stats Cards */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6"
        >
          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20"
          >
            <div className="flex items-center justify-between mb-2">
              <Activity className="w-10 h-10 text-[#3498db]" />
            </div>
            <div className="text-gray-300 text-sm mb-1">Total Detections</div>
            <div className="text-4xl font-bold text-white">{stats?.total_detections || 0}</div>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20"
          >
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle className="w-10 h-10 text-[#e74c3c]" />
            </div>
            <div className="text-gray-300 text-sm mb-1">Total Reports</div>
            <div className="text-4xl font-bold text-white">{stats?.total_reports || 0}</div>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20"
          >
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-10 h-10 text-[#2ecc71]" />
            </div>
            <div className="text-gray-300 text-sm mb-1">Last 24 Hours</div>
            <div className="text-4xl font-bold text-white">{stats?.detections_last_24h || 0}</div>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20"
          >
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="w-10 h-10 text-[#f39c12]" />
            </div>
            <div className="text-gray-300 text-sm mb-1">Avg Confidence</div>
            <div className="text-4xl font-bold text-white">
              {stats?.avg_confidence ? `${(stats.avg_confidence * 100).toFixed(1)}%` : '0%'}
            </div>
          </motion.div>
        </motion.div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Trends Chart */}
          <motion.div
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20"
          >
            <h2 className="text-white text-xl font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="text-[#3498db] w-6 h-6" />
              Detection Trends
            </h2>
            {trends.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={formatTrendsData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                  <XAxis dataKey="date" stroke="#ffffff80" />
                  <YAxis stroke="#ffffff80" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(26, 26, 46, 0.95)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#3498db"
                    strokeWidth={2}
                    name="Detections"
                  />
                  <Line
                    type="monotone"
                    dataKey="uniqueTypes"
                    stroke="#2ecc71"
                    strokeWidth={2}
                    name="Unique Types"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-400">
                No data available
              </div>
            )}
          </motion.div>

          {/* Distribution Chart */}
          <motion.div
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20"
          >
            <h2 className="text-white text-xl font-semibold mb-4 flex items-center gap-2">
              <PieChart className="text-[#2ecc71] w-6 h-6" />
              Hazard Type Distribution
            </h2>
            {distribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <RechartsPieChart>
                  <Pie
                    data={formatDistributionData()}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {formatDistributionData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(26, 26, 46, 0.95)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-400">
                No data available
              </div>
            )}
          </motion.div>
        </div>

        {/* Distribution Bar Chart */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6"
        >
          <h2 className="text-white text-xl font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="text-[#f39c12] w-6 h-6" />
            Hazard Type Breakdown
          </h2>
          {distribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={formatDistributionData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                <XAxis dataKey="name" stroke="#ffffff80" />
                <YAxis stroke="#ffffff80" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(26, 26, 46, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
                <Legend />
                <Bar dataKey="value" fill="#3498db" name="Total Detections" />
                <Bar dataKey="driverLane" fill="#e74c3c" name="Driver Lane" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[400px] flex items-center justify-center text-gray-400">
              No data available
            </div>
          )}
        </motion.div>

        {/* Additional Stats */}
        {stats && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <div className="text-gray-300 text-sm mb-2">Driver Lane Hazards</div>
              <div className="text-3xl font-bold text-white">{stats.driver_lane_hazards || 0}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <div className="text-gray-300 text-sm mb-2">Most Common Type</div>
              <div className="text-3xl font-bold text-white">
                {stats.most_common_type || 'N/A'}
              </div>
              <div className="text-gray-400 text-sm mt-1">
                {stats.most_common_count || 0} detections
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <div className="text-gray-300 text-sm mb-2">Heatmap Points</div>
              <div className="text-3xl font-bold text-white">{heatmap.length}</div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

