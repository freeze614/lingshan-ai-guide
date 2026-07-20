import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Statistic, Table, Tag, Button, Badge, Tabs, Select, Input, Space } from 'antd';
import {
  TeamOutlined, SmileOutlined, MessageOutlined,
  EnvironmentOutlined,
  LogoutOutlined, BookOutlined, 
  BarChartOutlined, DashboardOutlined, DownloadOutlined,
  SearchOutlined, ReloadOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { adminAPI } from '../../services/api';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const wsRef = useRef<WebSocket | null>(null);
  const liveCountRef = useRef(0);

  // Conversation detail state
  const [convList, setConvList] = useState<any[]>([]);
  const [convTotal, setConvTotal] = useState(0);
  const [convPage, setConvPage] = useState(1);
  const [convFilters, setConvFilters] = useState<any>({});
  const [convLoading, setConvLoading] = useState(false);

  // Unsatisfied / location state
  const [unsatisfied, setUnsatisfied] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [categoryDist, setCategoryDist] = useState<any>({});

  // WebSocket subscription for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe_admin' }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'connected') {
          setLiveConnected(true);
        } else if (msg.type === 'new_query') {
          liveCountRef.current += 1;
          setData((prev: any) => prev ? {
            ...prev,
            today_queries: (prev.today_queries || 0) + 1,
          } : prev);
        }
      } catch {}
    };

    ws.onclose = () => setLiveConnected(false);
    ws.onerror = () => setLiveConnected(false);

    return () => { ws.close(); };
  }, []);

  useEffect(() => {
    adminAPI.getDashboard().then(res => setData(res.data)).catch(err => console.error(err));
  }, []);

  const handleQuery = () => {
    // Use the latest convFilters via a ref snapshot
    const currentFilters = { ...convFilters };
    fetchConversations(1, currentFilters);
  };

  const fetchConversations = async (page = 1, filters = convFilters) => {
    setConvLoading(true);
    try {
      const res = await adminAPI.getConversations({ page, pageSize: 20, ...filters });
      setConvList(res.data.items || []);
      setConvTotal(res.data.total || 0);
      setConvPage(page);
    } catch {}
    setConvLoading(false);
  };

  const fetchUnsatisfied = async () => {
    try {
      const res = await adminAPI.getTopUnsatisfied();
      setUnsatisfied(res.data || []);
    } catch {}
  };

  const fetchLocations = async () => {
    try {
      const res = await adminAPI.getVisitorLocations();
      setLocations(res.data || []);
    } catch {}
  };

  const fetchCategoryDist = async () => {
    try {
      const res = await adminAPI.getCategoryDistribution();
      setCategoryDist(res.data || {});
    } catch {}
  };

  useEffect(() => {
    if (activeTab === 'detail') fetchConversations(1);
    if (activeTab === 'satisfaction') {
      fetchUnsatisfied();
      fetchLocations();
      fetchCategoryDist();
    }
  }, [activeTab]);

  const handleExportCSV = () => {
    adminAPI.exportConversations(convFilters);
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    navigate('/admin/login');
  };

  if (!data) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;

  const satisfactionOption = {
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie',
      radius: ['50%', '75%'],
      itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 3 },
      label: { show: false },
      data: [
        { value: data.sentiment_distribution?.positive || 0, name: '正面', itemStyle: { color: '#52c41a' } },
        { value: data.sentiment_distribution?.neutral || 0, name: '中性', itemStyle: { color: '#faad14' } },
        { value: data.sentiment_distribution?.negative || 0, name: '负面', itemStyle: { color: '#ff4d4f' } },
      ],
    }],
  };

  const trendOption = {
    tooltip: { trigger: 'axis' },
    grid: { top: 10, bottom: 20, left: 30, right: 10 },
    xAxis: {
      type: 'category',
      data: (data.satisfaction_trend || []).map((d: any) => d.date),
    },
    yAxis: { type: 'value', min: 0, max: 5 },
    series: [{
      data: (data.satisfaction_trend || []).map((d: any) => d.score),
      type: 'line',
      smooth: true,
      lineStyle: { color: '#c41d7f' },
      itemStyle: { color: '#c41d7f' },
    }],
  };

  const hourlyOption = {
    tooltip: { trigger: 'axis' },
    grid: { top: 10, bottom: 20, left: 30, right: 10 },
    xAxis: {
      type: 'category',
      data: (data.hourly_distribution || []).map((d: any) => `${d.hour}时`),
    },
    yAxis: { type: 'value' },
    series: [{
      data: (data.hourly_distribution || []).map((d: any) => d.count),
      type: 'bar',
      itemStyle: { color: '#1890ff', borderRadius: [4, 4, 0, 0] },
    }],
  };

  const categoryOption = {
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie',
      radius: '65%',
      data: [
        { value: categoryDist?.ticket || 0, name: '票价', itemStyle: { color: '#ff7a45' } },
        { value: categoryDist?.route || 0, name: '路线', itemStyle: { color: '#1890ff' } },
        { value: categoryDist?.history || 0, name: '历史', itemStyle: { color: '#722ed1' } },
        { value: categoryDist?.facility || 0, name: '设施', itemStyle: { color: '#52c41a' } },
        { value: categoryDist?.other || 0, name: '其他', itemStyle: { color: '#8c8c8c' } },
      ],
    }],
  };

  const convColumns = [
    { title: '时间', dataIndex: 'timestamp', key: 'time', width: 160, render: (v: string) => v?.replace('T', ' ').slice(0, 19) },
    { title: '会话ID', dataIndex: 'session_id', key: 'sid', width: 100, render: (v: string) => v?.slice(0, 8) },
    { title: '分类', dataIndex: 'category', key: 'cat', width: 70, render: (v: string) => {
      const cats: Record<string, string> = { ticket: '票价', route: '路线', history: '历史', facility: '设施' };
      return <Tag>{cats[v] || '其他'}</Tag>;
    }},
    { title: '用户问题', dataIndex: 'query', key: 'query', ellipsis: true, width: 200 },
    { title: 'AI回复', dataIndex: 'answer', key: 'answer', ellipsis: true, width: 250 },
    { title: '耗时', dataIndex: 'response_time_ms', key: 'rt', width: 80, render: (v: number) => `${v}ms` },
    { title: '评价', dataIndex: 'feedback', key: 'fb', width: 80, render: (v: string) => {
      if (v === 'helpful') return <Tag color="green">👍</Tag>;
      if (v === 'unhelpful') return <Tag color="red">👎</Tag>;
      return <Tag>-</Tag>;
    }},
  ];

  const unsatisfiedColumns = [
    { title: '排名', key: 'rank', width: 60, render: (_: any, __: any, i: number) => i + 1 },
    { title: '问题内容', dataIndex: 'query', key: 'query', ellipsis: true },
    { title: '点踩次数', dataIndex: 'count', key: 'count', width: 100, render: (v: number) => <Tag color="red">{v}</Tag> },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '12px 24px', display: 'flex', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#c41d7f', marginRight: 16 }}>🏯 灵山胜境</span>
        <span style={{ fontSize: 14, color: '#666' }}>管理后台</span>
        <div style={{ flex: 1 }} />
        <Badge status={liveConnected ? 'success' : 'default'} text={liveConnected ? '实时连接' : '未连接'} style={{ marginRight: 16 }} />
        <Button size="small" style={{ marginRight: 8 }} onClick={() => navigate('/admin/knowledge')}>知识库</Button>
        <Button size="small" type="primary" style={{ marginRight: 8 }} onClick={() => navigate('/admin/digital-human')}>数字人</Button>
        <Button icon={<DownloadOutlined />} onClick={handleExportCSV} size="small" style={{ marginRight: 8 }}>导出报告</Button>
        <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} />
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ padding: '0 24px', background: '#fff', marginBottom: 4 }} size="large"
        items={[
          { label: <span><DashboardOutlined /> 概览</span>, key: 'overview' },
          { label: <span><SearchOutlined /> 问答明细</span>, key: 'detail' },
          { label: <span><SmileOutlined /> 满意度分析</span>, key: 'satisfaction' },
        ]}
      />

      <div style={{ padding: '0 24px 40px' }}>
        {activeTab === 'overview' && (
          <>
            {/* Stats */}
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={12} md={4}><Card><Statistic title="今日问答" value={data.today_queries} prefix={<MessageOutlined />} /></Card></Col>
              <Col xs={12} md={4}><Card><Statistic title="周问答" value={data.week_queries} prefix={<BarChartOutlined />} /></Card></Col>
              <Col xs={12} md={4}><Card><Statistic title="月问答" value={data.monthly_queries} prefix={<TeamOutlined />} /></Card></Col>
              <Col xs={12} md={4}><Card><Statistic title="满意度" value={data.avg_satisfaction} suffix="%" prefix={<SmileOutlined />} /></Card></Col>
              <Col xs={12} md={4}><Card><Statistic title="总知识分块" value={data.total_knowledge_chunks} prefix={<BookOutlined />} /></Card></Col>
              <Col xs={12} md={4}><Card><Statistic title="总景点" value={data.total_spots} prefix={<EnvironmentOutlined />} /></Card></Col>
            </Row>

            {/* Charts */}
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={24} md={12}>
                <Card title="情感分布">
                  <ReactECharts option={satisfactionOption} style={{ height: 250 }} />
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card title="满意度趋势">
                  <ReactECharts option={trendOption} style={{ height: 250 }} />
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={24} md={12}>
                <Card title="时段分布（近7天）">
                  <ReactECharts option={hourlyOption} style={{ height: 250 }} />
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card title="热点问题 Top 10">
                  {(data.top_hot_questions || []).map((q: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <Tag color={i < 3 ? 'magenta' : 'default'} style={{ marginRight: 8 }}>#{i + 1}</Tag>
                      <span style={{ flex: 1, fontSize: 13 }}>{q.question}</span>
                      <Tag>{q.count}次</Tag>
                    </div>
                  ))}
                </Card>
              </Col>
            </Row>
          </>
        )}

        {activeTab === 'detail' && (
          <>
            {/* Filters */}
            <Card size="small" style={{ marginTop: 16 }}>
              <Space wrap>
                <Select placeholder="问题分类" allowClear style={{ width: 120 }}
                  onChange={(v) => setConvFilters((f: any) => ({ ...f, category: v || undefined }))}>
                  <Select.Option value="ticket">票价</Select.Option>
                  <Select.Option value="route">路线</Select.Option>
                  <Select.Option value="history">历史</Select.Option>
                  <Select.Option value="facility">设施</Select.Option>
                  <Select.Option value="other">其他</Select.Option>
                </Select>
                <Input placeholder="搜索关键词" prefix={<SearchOutlined />} style={{ width: 200 }}
                  onPressEnter={(e) => { const v = (e.target as HTMLInputElement).value; setConvFilters((f: any) => ({ ...f, keyword: v || undefined })); }} />
                <Button type="primary" icon={<SearchOutlined />} onClick={handleQuery}>查询</Button>
                <Button icon={<ReloadOutlined />} onClick={() => { setConvFilters({}); fetchConversations(1, {}); }}>重置</Button>
                <Button icon={<DownloadOutlined />} onClick={handleExportCSV}>导出CSV</Button>
              </Space>
            </Card>

            {/* Table */}
            <Card style={{ marginTop: 12 }}>
              <Table
                columns={convColumns}
                dataSource={convList}
                rowKey="id"
                loading={convLoading}
                size="small"
                pagination={{
                  current: convPage,
                  total: convTotal,
                  pageSize: 20,
                  showTotal: (t) => `共 ${t} 条`,
                  onChange: (p) => fetchConversations(p),
                }}
                scroll={{ x: 900 }}
              />
            </Card>
          </>
        )}

        {activeTab === 'satisfaction' && (
          <>
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={24} md={12}>
                <Card title="不满意问答 Top 10">
                  <Table columns={unsatisfiedColumns} dataSource={unsatisfied} rowKey="query" size="small" pagination={false} />
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card title="问题分类分布">
                  <ReactECharts option={categoryOption} style={{ height: 300 }} />
                </Card>
              </Col>
            </Row>
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col span={24}>
                <Card title="📊 满意度趋势（近30天）">
                  <ReactECharts option={{
                    ...trendOption,
                    xAxis: { ...trendOption.xAxis, data: (data.satisfaction_trend || []).slice(-30).map((d: any) => d.date) },
                    series: [{ ...trendOption.series[0], data: (data.satisfaction_trend || []).slice(-30).map((d: any) => d.score) }],
                  }} style={{ height: 250 }} />
                </Card>
              </Col>
            </Row>
            {locations.length > 0 && (
              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col span={24}>
                  <Card title="游客位置分布（脱敏）">
                    <div style={{ maxHeight: 300, overflow: 'auto' }}>
                      <Table
                        dataSource={locations}
                        columns={[
                          { title: '纬度', dataIndex: 'lat', key: 'lat' },
                          { title: '经度', dataIndex: 'lng', key: 'lng' },
                          { title: '访问次数', dataIndex: 'count', key: 'count', render: (v: number) => <Tag color="blue">{v}</Tag> },
                        ]}
                        rowKey={(r) => `${r.lat},${r.lng}`}
                        size="small"
                        pagination={false}
                      />
                    </div>
                  </Card>
                </Col>
              </Row>
            )}
          </>
        )}
      </div>
    </div>
  );
}