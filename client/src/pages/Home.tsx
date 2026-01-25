/**
 * 兒少守護小蜂 - 首頁 (溫暖守護者 最終修復版)
 * Fixes: 
 * 1. 地區選單改用原生 <select> 保證可點擊
 * 2. 搜尋參數傳遞優化
 * 3. 完整保留 UI 設計風格
 */
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
  ShieldCheck, // 增加這個給裁罰
  Scale        // 增加這個給判決
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';

// 資料來源圖示對照
const sourceIcons: Record<string, React.ReactNode> = {
  'gov_crc': <Database className="w-3 h-3" />,
  'gov_edu': <ShieldCheck className="w-3 h-3" />,
  'judicial': <Scale className="w-3 h-3" />,
  'news': <Newspaper className="w-3 h-3" />,
  'default': <Info className="w-3 h-3" />
};

// 資料來源名稱對照
const sourceLabels: Record<string, string> = {
  'gov_crc': 'CRC 裁罰',
  'gov_edu': '教保裁罰',
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

  // 取得地區列表 (後端動態提供)
  const { data: areaOptions = ['全部地區'] } = trpc.search.areas.useQuery();

  // 取得資料庫狀態 (真實數據)
  const { data: dbStatus, isLoading: isDbLoading } = trpc.database.lastUpdate.useQuery();

  // 搜尋參數
  const [searchParams, setSearchParams] = useState<{ 
    name?: string; 
    area?: string; 
    limit?: number;
    offset?: number;
  } | null>(null);
  
  // 查詢 API
  const { data: searchResults, isLoading: isSearching, isFetching } = trpc.search.cases.useQuery(
    searchParams!,
    { enabled: !!searchParams }
  );

  const displayResults = searchParams?.offset === 0 
    ? searchResults?.results || []
    : [...allResults, ...(searchResults?.results || [])];

  const handleSearch = async () => {
    // 檢查是否有輸入任何條件
    const hasName = searchName.trim().length > 0;
    const hasArea = selectedArea !== '全部地區';
    
    // 如果什麼都沒輸入，且地區也是全部，就不執行搜尋 (或者您可以允許搜尋全部，看需求)
    // 這裡設定：至少要輸入名字 OR 選一個地區
    // if (!hasName && !hasArea) return; 
    
    setHasSearched(true);
    setOffset(0);
    setAllResults([]);
    
    // 設定搜尋參數
    setSearchParams({
      name: hasName ? searchName.trim() : undefined,
      area: hasArea ? selectedArea : undefined, // 如果是全部地區，就傳 undefined 讓後端搜全台
      limit: 15,
      offset: 0,
    });
  };

  const handleLoadMore = () => {
    if (!searchResults?.hasMore || isFetching) return;
    const newOffset = offset + 15;
    setOffset(newOffset);
    // 保留舊資料，加上新資料
    setAllResults(displayResults);
    setSearchParams(prev => prev ? { ...prev, offset: newOffset } : null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Header */}
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
          <Button variant="outline" size="sm" className="md:hidden border-honey text-honey-dark" asChild>
            <Link href="/report">求助</Link>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-12 md:py-20 honeycomb-bg bg-[#FFFBF0]">
        <div className="container relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto text-center"
          >
            {/* Mascot Animation */}
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
              守護孩子的安全，從查詢開始
            </p>

            {/* Search Card */}
            <Card className="bg-white/95 backdrop-blur shadow-xl border-honey-light/30 rounded-2xl overflow-hidden">
              <CardContent className="p-4 md:p-6">
                <div className="flex flex-col md:flex-row gap-3">
                  
                  {/* 輸入框 */}
                  <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="輸入姓名、機構或關鍵字..."
                      value={searchName}
                      onChange={(e) => setSearchName(e.target.value)}
                      onKeyDown={handleKeyPress}
                      className="pl-12 h-12 text-base border-2 border-honey-light/50 focus:border-honey rounded-xl bg-white"
                    />
                  </div>
                  
                  {/* 🔥 地區選單 (修復版：使用原生 select) */}
                  <div className="relative w-full md:w-48 h-12">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
                    <select
                      value={selectedArea}
                      onChange={(e) => setSelectedArea(e.target.value)}
                      className="w-full h-full pl-10 pr-8 appearance-none bg-white border-2 border-honey-light/50 focus:border-honey rounded-xl text-base outline-none cursor-pointer text-foreground"
                      style={{ WebkitAppearance: 'none', MozAppearance: 'none' }} 
                    >
                      {areaOptions.map((area) => (
                        <option key={area} value={area}>
                          {area}
                        </option>
                      ))}
                    </select>
                    {/* 自訂下拉箭頭 */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6"/>
                      </svg>
                    </div>
                  </div>

                  {/* 搜尋按鈕 */}
                  <Button 
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="h-12 px-8 bg-[#F59E0B] hover:bg-[#D97706] text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
                  >
                    {isSearching ? '...' : '搜尋'}
                  </Button>
                </div>
                
                <div className="flex flex-wrap justify-center gap-4 mt-4 text-xs text-muted-foreground font-medium">
                  <span className="flex items-center gap-1"><Database className="w-3 h-3" /> 政府公告</span>
                  <span className="flex items-center gap-1"><Newspaper className="w-3 h-3" /> 媒體報導</span>
                </div>
                
                {/* 資料庫狀態 */}
                <div className="flex justify-center mt-3 text-xs text-green-600 gap-2 items-center">
                   <div className={`w-2 h-2 rounded-full ${dbStatus ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                   <span>
                      資料庫更新：
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

      {/* Results Section */}
      {hasSearched && (
        <section className="py-8 bg-[#f8fafc]">
          <div className="container">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto"
            >
              {isSearching && offset === 0 ? (
                <div className="text-center py-12">
                   <div className="animate-spin text-4xl mb-2">🐝</div>
                   <p className="text-muted-foreground">小蜂正在搜尋資料庫...</p>
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
                        <h3 className="text-xl font-bold text-green-700 mb-2">查無異常紀錄</h3>
                        <p className="text-slate-600">
                          {searchResults?.disclaimer || "經即時搜尋政府公開資訊，目前未發現相符紀錄。"}
                        </p>
                        <p className="text-xs text-slate-400 mt-4">
                            小提醒：試著縮短關鍵字（例如輸入「林」而不是「林小明」）可以擴大搜尋範圍。
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {displayResults.map((result, index) => (
                    <ResultCard key={`${result.case.id}-${index}`} result={result} index={index} />
                  ))}

                  {searchResults?.hasMore && (
                    <div className="text-center py-6">
                      <Button onClick={handleLoadMore} disabled={isFetching} variant="outline" className="w-full md:w-auto">
                        {isFetching ? '載入中...' : '載入更多'}
                      </Button>
                    </div>
                  )}
                  
                  {searchResults?.results.length! > 0 && (
                     <p className="text-sm text-slate-400 text-center py-4">
                       ⚠️ 本結果包含系統自動彙整資訊，請務必點擊來源連結查證。
                     </p>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-auto py-8 bg-slate-800 text-white/80">
        <div className="container">
          <div className="max-w-4xl mx-auto text-center text-sm">
             <p>資料來源：司法院裁判書、媒體報導、教育部教保網、衛生福利部 CRC</p>
             <p className="mt-2 opacity-60">© 2026 兒少守護小蜂</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ResultCard Component
function ResultCard({ result, index }: { result: any, index: number }) {
  const { case: caseData, matchType } = result;

  // 1. 決定來源類型 (Mapping)
  let sourceTypeKey = 'default';
  const type = caseData.sourceType as string;
  
  // 根據後端回傳的 sourceType 轉成前端的 key
  if (type === 'gov_edu' || type === 'kindergarten') sourceTypeKey = 'gov_edu';
  else if (type === 'judicial') sourceTypeKey = 'judicial';
  else if (type === 'news') sourceTypeKey = 'news';
  else if (['gov_crc', 'crc', 'mohw', 'government'].includes(type)) sourceTypeKey = 'gov_crc';

  // 2. 標籤解析 (Risk Tags)
  let tags: string[] = [];
  try {
    if (Array.isArray(caseData.riskTags)) {
      tags = caseData.riskTags;
    } else if (typeof caseData.riskTags === 'string') {
      const clean = caseData.riskTags.trim();
      tags = (clean.startsWith('[') && clean.endsWith(']')) ? JSON.parse(clean) : [clean];
    }
  } catch(e) { tags = []; }

  // 3. 名稱顯示 (媒體報導顯示標題，其他顯示姓名)
  const displayName = sourceTypeKey === 'news' 
    ? (caseData.originalName || caseData.name) 
    : caseData.maskedName;

  // 4. 日期格式化
  const dateObj = caseData.caseDate ? new Date(caseData.caseDate) : new Date(caseData.createdAt);
  const dateStr = dateObj.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });

  // 5. 樣式定義 (依來源區分顏色)
  const styles = {
      'gov_crc': 'border-l-red-500 hover:shadow-red-100',
      'gov_edu': 'border-l-orange-500 hover:shadow-orange-100',
      'judicial': 'border-l-purple-500 hover:shadow-purple-100',
      'news': 'border-l-blue-400 hover:shadow-blue-100',
      'default': 'border-l-slate-400'
  };
  const borderClass = styles[sourceTypeKey as keyof typeof styles] || styles['default'];

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card className={`border-l-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${borderClass} bg-white`}>
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row gap-4">
            
            {/* 左側主要內容 */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {/* 來源標籤 */}
                <Badge variant="outline" className="bg-slate-50 text-slate-600 font-normal border-slate-200 flex gap-1 items-center">
                    {sourceIcons[sourceTypeKey] || sourceIcons['default']}
                    {sourceLabels[sourceTypeKey] || caseData.sourceType}
                </Badge>
                
                {/* 日期 */}
                <span className="text-xs text-slate-400">
                    {dateStr}
                </span>

                {/* 高度關注標籤 */}
                {matchType === 'high' && sourceTypeKey !== 'news' && (
                  <Badge variant="destructive" className="animate-pulse px-2 py-0 text-[10px]">高度關注</Badge>
                )}
              </div>
              
              <h3 className="text-lg font-bold text-slate-800 mb-2 leading-snug group-hover:text-blue-600">
                {displayName}
              </h3>

              {/* Tag & Location */}
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

              {/* 描述文字 (限制行數) */}
              {caseData.description && (
                <div className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                   {caseData.description}
                </div>
              )}
            </div>

            {/* 右側動作欄 */}
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