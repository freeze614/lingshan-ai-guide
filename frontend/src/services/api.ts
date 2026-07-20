import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 90000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — inject JWT for admin routes
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token && config.url?.startsWith('/admin')) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401 by redirecting to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && error.config?.url?.startsWith('/admin')) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      if (window.location.pathname.startsWith('/admin') && !window.location.pathname.includes('/login')) {
        window.location.href = '/admin/login';
      }
    }
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default api;

// API methods
export const visitorAPI = {
  initSession: () => api.post('/visitor/session/init'),
  askQuestion: (query: string, sessionId: string) =>
    api.post('/visitor/qa', { query, session_id: sessionId }),
  getSpots: () => api.get('/visitor/spots'),
  getSpotDetail: (id: string) => api.get(`/visitor/spots/${id}`),
  recommend: (interests: string[], duration: number) =>
    api.post('/visitor/recommend', { interests, duration }),
  submitFeedback: (sessionId: string, rating: number, comment: string) =>
    api.post('/visitor/feedback', { session_id: sessionId, rating, comment }),
  getHotQuestions: () => api.get('/visitor/hot-questions'),
  recognizeImage: (imageBase64: string) =>
    api.post('/visitor/vision/recognize', { image_base64: imageBase64 }),
  textToSpeech: (text: string) =>
    api.post('/visitor/tts', { text }),
  getStatus: () => api.get('/visitor/status'),
};

export const adminAPI = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  getDashboard: () => api.get('/admin/dashboard/summary'),
  getSentimentReport: (period: string = 'week') =>
    api.get('/admin/reports/sentiment', { params: { period } }),
  getDigitalHuman: () => api.get('/admin/digital-human/appearance'),
  updateDigitalHuman: (config: any) =>
    api.put('/admin/digital-human/appearance', config),
  uploadDocument: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/admin/knowledge/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getDocuments: () => api.get('/admin/knowledge/documents'),
  deleteDocument: (id: string) => api.delete(`/admin/knowledge/documents/${id}`),
  refreshIndex: () => api.post('/admin/knowledge/refresh-index'),
  getKnowledgeStats: () => api.get('/admin/knowledge/stats'),
  analyzeSentiment: (text: string) =>
    api.post('/admin/reports/analyze-sentiment', { text }),
  getConversations: (params: any) =>
    api.get('/admin/conversations', { params }),
  getTopUnsatisfied: () =>
    api.get('/admin/top-unsatisfied'),
  getVisitorLocations: () =>
    api.get('/admin/visitor-locations'),
  getCategoryDistribution: () =>
    api.get('/admin/category-distribution'),
  exportConversations: async (params: any) => {
    const token = localStorage.getItem('admin_token');
    const queryStr = new URLSearchParams(params).toString();
    const res = await fetch(`/api/v1/admin/conversations/export?${queryStr}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversations_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
