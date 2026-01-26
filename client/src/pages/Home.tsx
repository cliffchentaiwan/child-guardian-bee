// client/src/pages/Home.tsx
'use client';

import { useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { 
  Search, 
  Database, 
  Newspaper, 
  MapPin, 
  CheckCircle, 
  ExternalLink, 
  Info,
  ShieldCheck, 
  Scale,
  AlertTriangle 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';

// 資料來源圖示與名稱
const sourceIcons: Record<string, React.ReactNode> = {
  'gov_crc': <Database className="w-3 h-3" />,
  'gov_ece': <AlertTriangle className="w-3 h-3" />, 
  'gov_edu': <ShieldCheck className="w-3 h-3" />,
  'judicial': <Scale className="w-3 h-3" />,
  'news': <Newspaper className="w-3 h-3" />,
  'default': <Info className="w-3 h-3" />
};

const sourceLabels: Record<string, string> = {
  'gov_crc': 'CRC 兒少裁罰',
  'gov_ece': '教保違規裁罰',
  'gov_edu': '教育部名錄',
  'judicial': '司法判決',
  'news': '媒體報導',
  'default': '一般資訊'
};

export default function Home() {
  const [searchName, setSearchName] = useState('');
  const [selectedArea, setSelectedArea] = useState('全部地區');
  const [hasSearched, setHasSearched] = useState(false);
  const [offset, setOffset] = useState(0);
  const [allResults, setAllResults] = useState<any[]>([]);

  // 記錄「當下搜尋」的條件，用於顯示結果標題 (避免使用者改了輸入框還沒按搜尋，標題就變了)
  const [currentSearchDisplay, setCurrentSearchDisplay] = useState({ name: '', area: '' });

  const { data: areaOptions = ['全部地區'] } = trpc.search.areas.useQuery();
  const { data: dbStatus, isLoading: isDbLoading } = trpc.database.lastUpdate.useQuery();

  const [searchParams, setSearchParams] = useState<{ 
    name?: string; 
    area?: string; 
    limit?: number;
    offset?: number;
  } | null>(null);
  
  const { data: searchResults, isLoading: isSearching, isFetching } = trpc.search.cases.useQuery(
    searchParams!,
    { enabled: !!searchParams }
  );

  const displayResults = searchParams?.offset === 0 
    ? searchResults?.results || []
    : [...allResults, ...(searchResults?.results || [])];

  const handleSearch = async () => {
    setHasSearched(true);
    setOffset(0);
    setAllResults([]);
    
    // 記錄當下顯示用的標題
    setCurrentSearchDisplay({
        name: searchName.trim(),
        area: selectedArea
    });
    
    setSearchParams({
      name: searchName.trim() || undefined,
      area: selectedArea === '全部地區' ? undefined : selectedArea,
      limit: 15,
      offset: 0,
    });
  };

  const handleLoadMore = () => {
    if (!searchResults?.hasMore || isFetching) return;
    const newOffset = offset + 15;
    setOffset(newOffset);
    setAllResults(displayResults);
    setSearchParams(prev => prev ? { ...prev, offset: newOffset } : null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <header className="sticky top-0 z-50 backdrop-blur-md border-b border-honey-light/30" style={{ backgroundColor: 'oklch(0.985 0.015 90 / 0.8)' }}>
        <div className="container py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <span className="text-2xl mr-1">🐝</span>
            <span className="font-bold text-lg text-amber-deep hidden md:inline">兒少守護小蜂</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/report" className="text-foreground/70 hover:text-honey-dark transition-colors font-medium cursor-pointer">通報事件</Link>
            <Link href="/education" className="text-foreground/70 hover:text-honey-dark transition-colors font-medium cursor-pointer">教育專區</Link>
          </nav>
        </div>
      </header>

      <section className="relative py-12 md:py-20 honeycomb-bg bg-[#FFFBF0]">
        <div className="container relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto text-center"
          >
            <motion.div
               animate={{ y: [0, -10, 0] }}
               transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
               className="mb-6 flex justify-center text-8xl"
            >
               🐝
            </motion.div>
            
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-amber-deep mb-4 tracking-tight">
              兒少守護小蜂
            </h1>
            <p className="text-lg md:text-xl text-foreground/70 mb-8 font-medium">
              全台最完整的兒少安全預警系統
            </p>

            <Card className="bg-white/95 backdrop-blur shadow-xl border-honey-light/30 rounded-2xl overflow-hidden">
              <CardContent className="p-4 md:p-6">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="輸入幼兒園名稱、老師姓名..."
                      value={searchName}
                      onChange={(e) => setSearchName(e.target.value)}
                      onKeyDown={handleKeyPress}
                      className="pl-12 h-12 text-base border-2 border-honey-light/50 focus:border-honey rounded-xl bg-white"
                    />
                  </div>
                  
                  <div className="relative w-full md:w-48 h-12">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
                    <select
                      value={selectedArea}
                      onChange={(e) => setSelectedArea(e.target.value)}
                      className="w-full h-full pl-10 pr-8 appearance-none bg-white border-2 border-honey-light/50 focus:border-honey rounded-xl text-base outline-none cursor-pointer text-foreground"
                    >
                      {areaOptions.map((area) => (
                        <option key={area} value={area}>{area}</option>
                      ))}
                    </select>
                  </div>

                  <Button 
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="h-12 px-8 bg-[#F59E0B] hover:bg-[#D97706] text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
                  >
                    {isSearching ? '...' : '搜尋'}
                  </Button>
                </div>
                
                <div className="flex flex-wrap justify-center gap-4 mt-4 text-xs text-muted-foreground font-medium">
                  <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-orange-500" /> 教保裁罰</span>
                  <span className="flex items-center gap-1"><Database className="w-3 h-3 text-red-500" /> 衛福部裁罰</span>
                  <span className="flex items-center gap-1"><Newspaper className="w-3 h-3 text-blue-500" /> 媒體報導</span>
                </div>
                
                <div className="flex justify-center mt-3 text-xs text-green-600 gap-2 items-center">
                   <div className={`w-2 h-2 rounded-full ${dbStatus ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                   <span>
                      資料庫最後更新：
                      {isDbLoading ? '讀取中...' : (
                        dbStatus?.lastUpdateTime 
                          ? new Date(dbStatus.lastUpdateTime).toLocaleString('zh-TW', { hour12: false }) 
                          : '尚未同步'
                      )}
                   </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {hasSearched && (
        <section className="py-8 bg-[#f8fafc]">
          <div className="container">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto"
            >
              {/* 🔥 新增：搜尋條件提示 */}
              <div className="mb-6 text-center">
                  <p className="text-slate-500">
                     正在搜尋：
                     <span className="font-bold text-slate-800 mx-1 text-lg">
                        {currentSearchDisplay.name || '全部名稱'}
                     </span>
                     {currentSearchDisplay.area !== '全部地區' && (
                         <>
                            位於 <span className="font-bold text-slate-800 mx-1">{currentSearchDisplay.area}</span>
                         </>
                     )}
                  </p>
              </div>

              {isSearching && offset === 0 ? (
                <div className="text-center py-12">
                   <div className="animate-spin text-4xl mb-2">🐝</div>
                   <p className="text-muted-foreground">小蜂正在飛速搜尋中...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-bold text-slate-700">搜尋結果</h2>
                    {searchResults?.results && (
                        <span className="text-sm bg-slate-200 px-2 py-1 rounded-full text-slate-600">
                            已顯示 {displayResults.length} 筆
                        </span>
                    )}
                  </div>

                  {!searchResults?.found && (
                    <Card className="bg-green-50 border-green-200">
                      <CardContent className="p-8 text-center">
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        {/* 🔥 優化：顯示更明確的無資料訊息 */}
                        <h3 className="text-xl font-bold text-green-700 mb-2">
                           關於「{currentSearchDisplay.name || '此搜尋條件'}」查無異常紀錄
                        </h3>
                        <p className="text-slate-600">
                          {searchResults?.disclaimer || "太棒了！目前在我們的資料庫中未發現相符的違規紀錄。"}
                        </p>
                        {/* 溫馨提示 */}
                        <div className="mt-4 p-3 bg-white/50 rounded-lg text-sm text-slate-500 inline-block text-left">
                           <p>💡 搜尋小撇步：</p>
                           <ul className="list-disc list-inside mt-1">
                              <li>試著只輸入關鍵字（例如「長頸鹿」而不是「長頸鹿幼兒園」）</li>
                              <li>我們會自動幫您搜尋「幼稚園」與「幼兒園」</li>
                           </ul>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {displayResults.map((result, index) => (
                    <ResultCard key={`${result.case.id}-${index}`} result={result} index={index} />
                  ))}

                  {searchResults?.hasMore && (
                    <div className="text-center py-6">
                      <Button onClick={handleLoadMore} disabled={isFetching} variant="outline" className="w-full md:w-auto">
                        {isFetching ? '載入中...' : '載入更多結果'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </section>
      )}

      <footer className="mt-auto py-8 bg-slate-800 text-white/80">
        <div className="container">
          <div className="max-w-4xl mx-auto text-center text-sm">
             <p>資料來源：教育部全國教保網、衛生福利部 CRC、司法院裁判書、各大媒體</p>
             <p className="mt-2 opacity-60">© 2026 兒少守護小蜂</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ResultCard Component
function ResultCard({ result, index }: { result: any, index: number }) {
  const { case: caseData } = result;

  // 1. 決定來源類型 Key
  let sourceTypeKey = 'default';
  const type = caseData.sourceType as string;
  
  if (type === 'gov_ece') sourceTypeKey = 'gov_ece';
  else if (type === 'gov_edu' || type === 'kindergarten') sourceTypeKey = 'gov_edu';
  else if (type === 'judicial') sourceTypeKey = 'judicial';
  else if (type === 'news') sourceTypeKey = 'news';
  else if (['gov_crc', 'crc', 'mohw', 'government'].includes(type)) sourceTypeKey = 'gov_crc';

  // 2. 標籤解析
  let tags: string[] = [];
  try {
    if (Array.isArray(caseData.riskTags)) {
      tags = caseData.riskTags;
    } else if (typeof caseData.riskTags === 'string') {
      const clean = caseData.riskTags.trim();
      tags = (clean.startsWith('[') && clean.endsWith(']')) ? JSON.parse(clean) : [clean];
    }
  } catch(e) { tags = []; }

  // 3. 名稱顯示
  const displayName = sourceTypeKey === 'news' 
    ? (caseData.originalName || caseData.name) 
    : caseData.maskedName;

  // 4. 日期格式化
  const dateObj = caseData.caseDate ? new Date(caseData.caseDate) : new Date(caseData.createdAt);
  const dateStr = dateObj.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });

  // 5. 樣式定義
  const styles = {
      'gov_crc': 'border-l-red-500 hover:shadow-red-100',
      'gov_ece': 'border-l-orange-500 hover:shadow-orange-100',
      'judicial': 'border-l-purple-500 hover:shadow-purple-100',
      'news': 'border-l-blue-400 hover:shadow-blue-100',
      'default': 'border-l-slate-400'
  };
  const borderClass = styles[sourceTypeKey as keyof typeof styles] || styles['default'];

  // 6. 標籤顏色
  const getBadgeColor = () => {
      if (sourceTypeKey === 'gov_crc') return 'bg-red-50 text-red-600 border-red-200';
      if (sourceTypeKey === 'gov_ece') return 'bg-orange-50 text-orange-600 border-orange-200';
      if (sourceTypeKey === 'judicial') return 'bg-purple-50 text-purple-600 border-purple-200';
      if (sourceTypeKey === 'news') return 'bg-blue-50 text-blue-600 border-blue-200';
      return 'bg-slate-50 text-slate-600 border-slate-200';
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card className={`border-l-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${borderClass} bg-white`}>
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="outline" className={`${getBadgeColor()} font-medium flex gap-1 items-center`}>
                    {sourceIcons[sourceTypeKey] || sourceIcons['default']}
                    {sourceLabels[sourceTypeKey] || caseData.sourceType}
                </Badge>
                <span className="text-xs text-slate-400">{dateStr}</span>
              </div>
              
              <h3 className="text-lg font-bold text-slate-800 mb-2 leading-snug">
                {displayName}
              </h3>

              <div className="flex flex-wrap gap-2 mb-3">
                {caseData.location && (
                   <span className="text-xs flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-1 rounded">
                     <MapPin className="w-3 h-3" />{caseData.location}
                   </span>
                )}
                {tags.map((tag, i) => (
                  <span key={i} className="text-xs text-slate-500 border border-slate-200 px-2 py-1 rounded">
                    #{tag}
                  </span>
                ))}
              </div>

              {caseData.description && (
                <div className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                   {caseData.description}
                </div>
              )}
            </div>

            <div className="flex flex-col justify-end items-end gap-2 shrink-0 md:w-32">
               {caseData.sourceLink && caseData.sourceLink.startsWith('http') && (
                  <a 
                    href={caseData.sourceLink} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center gap-1 text-xs font-bold text-blue-500 hover:text-blue-700 hover:underline mt-2 md:mt-0"
                  >
                    查看來源 <ExternalLink className="w-3 h-3"/>
                  </a>
               )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}