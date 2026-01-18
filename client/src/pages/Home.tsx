/**
 * 兒少守護小蜂 - 首頁
 * Design: 溫暖守護者 (Warm Guardian) Style
 * Features: Hero Search, Quick Access, Disclaimer Footer
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { 
  Search, 
  AlertTriangle, 
  BookOpen, 
  Shield,
  ExternalLink,
  CheckCircle,
  Info,
  Database,
  Newspaper,
  Users,
  MapPin
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';

// 資料來源圖示
const sourceIcons: Record<string, React.ReactNode> = {
  '政府公告': <Database className="w-4 h-4" />,
  '媒體報導': <Newspaper className="w-4 h-4" />,
  '社群輿情': <Users className="w-4 h-4" />,
};

export default function Home() {
  const [searchName, setSearchName] = useState('');
  const [selectedArea, setSelectedArea] = useState('全部地區');
  const [hasSearched, setHasSearched] = useState(false);
  const [offset, setOffset] = useState(0);
  const [allResults, setAllResults] = useState<any[]>([]);

  // 使用 tRPC 取得地區列表
  const { data: areaOptions = ['全部地區'] } = trpc.search.areas.useQuery();

  // 取得資料庫最後更新時間
  const { data: dbStatus } = trpc.database.lastUpdate.useQuery();

  // 使用 tRPC 進行搜尋
  const [searchParams, setSearchParams] = useState<{ 
    name?: string; 
    area?: string; 
    limit?: number;
    offset?: number;
  } | null>(null);
  
  const { data: searchResults, isLoading: isSearching, isFetching } = trpc.search.cases.useQuery(
    searchParams!,
    {
      enabled: !!searchParams,
    }
  );

  // 當搜尋結果更新時，累積結果
  const displayResults = searchParams?.offset === 0 
    ? searchResults?.results || []
    : [...allResults, ...(searchResults?.results || [])];

  const handleSearch = async () => {
    // 允許只選地區搜尋，或輸入姓名搜尋
    const hasName = searchName.trim().length > 0;
    const hasArea = selectedArea !== '全部地區';
    
    if (!hasName && !hasArea) {
      // 如果什麼都沒選，顯示最新資料
    }
    
    setHasSearched(true);
    setOffset(0);
    setAllResults([]);
    setSearchParams({
      name: hasName ? searchName : undefined,
      area: hasArea ? selectedArea : undefined,
      limit: 15,
      offset: 0,
    });
  };

  const handleLoadMore = () => {
    if (!searchResults?.hasMore || isFetching) return;
    
    const newOffset = offset + 15;
    setOffset(newOffset);
    setAllResults(displayResults);
    setSearchParams(prev => prev ? {
      ...prev,
      offset: newOffset,
    } : null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };



  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b border-honey-light/30" style={{ backgroundColor: 'oklch(0.985 0.015 90 / 0.8)' }}>
        <div className="container py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img 
              src="/images/bee-mascot.png" 
              alt="守護小蜂" 
              className="w-10 h-10 object-contain"
            />
            <span className="font-bold text-lg text-amber-deep">兒少守護小蜂</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/report" className="text-foreground/70 hover:text-honey-dark transition-colors font-medium">
              通報事件
            </Link>
            <Link href="/education" className="text-foreground/70 hover:text-honey-dark transition-colors font-medium">
              教育專區
            </Link>
          </nav>
          <Button 
            variant="outline" 
            size="sm" 
            className="md:hidden border-honey text-honey-dark"
            asChild
          >
            <Link href="/report">我要求助</Link>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-12 md:py-20 honeycomb-bg">
        <div className="container relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto text-center"
          >
            {/* Mascot */}
            <motion.img 
              src="/images/bee-mascot.png" 
              alt="守護小蜂吉祥物"
              className="w-24 h-24 md:w-32 md:h-32 mx-auto mb-6"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-amber-deep mb-4">
              兒少守護小蜂
            </h1>
            <p className="text-lg md:text-xl text-foreground/70 mb-8">
              守護孩子的安全，從查詢開始
            </p>

            {/* Search Box */}
            <Card className="bg-white/95 backdrop-blur shadow-xl border-honey-light/30 rounded-2xl overflow-hidden">
              <CardContent className="p-4 md:p-6">
                <div className="flex flex-col md:flex-row gap-3">
                  {/* Name Input */}
                  <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="輸入姓名或暱稱..."
                      value={searchName}
                      onChange={(e) => setSearchName(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="pl-12 h-12 text-base border-2 border-honey-light/50 focus:border-honey rounded-xl"
                    />
                  </div>

                  {/* Area Select */}
                  <Select value={selectedArea} onValueChange={setSelectedArea}>
                    <SelectTrigger className="w-full md:w-48 h-12 border-2 border-honey-light/50 focus:border-honey rounded-xl">
                      <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="選擇地區" />
                    </SelectTrigger>
                    <SelectContent>
                      {areaOptions.map((area) => (
                        <SelectItem key={area} value={area}>
                          {area}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Search Button */}
                  <Button 
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="h-12 px-8 bg-honey hover:bg-honey-dark text-amber-deep font-semibold rounded-xl shadow-md hover:shadow-lg transition-all"
                  >
                    {isSearching ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Search className="w-5 h-5" />
                      </motion.div>
                    ) : (
                      <>
                        <Search className="w-5 h-5 mr-2" />
                        搜尋
                      </>
                    )}
                  </Button>
                </div>

                {/* Quick Tips */}
                <p className="text-sm text-muted-foreground mt-3 flex items-center justify-center gap-1">
                  <Info className="w-4 h-4" />
                  支援模糊比對，如「王小明」可比對「王○明」
                </p>

                {/* Data Source Indicators */}
                <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Database className="w-3 h-3" /> 政府公告
                  </span>
                  <span className="flex items-center gap-1">
                    <Newspaper className="w-3 h-3" /> 媒體報導
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> 社群輿情
                  </span>
                </div>

                {/* Data Sources Status */}
                <div className="flex flex-col items-center gap-2 mt-3 text-xs">
                  {/* Database Last Update */}
                  {dbStatus && (
                    <div className="flex items-center gap-2 text-safe-green">
                      <span className="w-2 h-2 rounded-full bg-safe-green" />
                      <span>
                        資料庫更新：{dbStatus.lastUpdateTime 
                          ? new Date(dbStatus.lastUpdateTime).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
                          : '尚未同步'}
                        {dbStatus.totalCases > 0 && ` • 共 ${dbStatus.totalCases.toLocaleString()} 筆資料`}
                      </span>
                    </div>
                  )}
                  {/* Data Sources */}
                  {dbStatus && dbStatus.sources.length > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>
                        資料來源：{dbStatus.sources.join('、')}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Search Results */}
      {hasSearched && (
        <section className="py-8 bg-secondary/30">
          <div className="container">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto"
            >
              {isSearching ? (
                <div className="text-center py-12">
                  <motion.img 
                    src="/images/bee-mascot.png" 
                    alt="搜尋中"
                    className="w-16 h-16 mx-auto mb-4"
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  />
                  <p className="text-muted-foreground">小蜂正在搜尋中...</p>
                </div>
              ) : searchResults ? (
                <div className="space-y-4">
                  {/* Results Header */}
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-foreground">
                      搜尋結果
                      {searchResults.total > 0 && (
                        <span className="text-muted-foreground font-normal ml-2">
                          ({searchResults.total} 筆)
                        </span>
                      )}
                    </h2>
                  </div>

                  {/* No Results */}
                  {!searchResults.found && (
                    <Card className="bg-safe-green/10 border-safe-green/30">
                      <CardContent className="p-6 text-center">
                        <CheckCircle className="w-12 h-12 text-safe-green mx-auto mb-3" />
                        <h3 className="text-lg font-semibold text-safe-green mb-2">
                          查無異常紀錄
                        </h3>
                        <p className="text-foreground/70">
                          {searchResults.disclaimer}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Results List */}
                  {searchResults.found && (
                    <>
                      {/* Warning Banner */}
                      <Card className="bg-warning-coral/10 border-warning-coral/30">
                        <CardContent className="p-4 flex items-start gap-3">
                          <AlertTriangle className="w-6 h-6 text-warning-coral flex-shrink-0 mt-0.5" />
                          <div>
                            <h3 className="font-semibold text-warning-coral">
                              {searchResults.searchedName ? '發現相似紀錄' : '查詢結果'}
                            </h3>
                            <p className="text-sm text-foreground/70 mt-1">
                              {searchResults.searchedName 
                                ? `以下為與「${searchResults.searchedName}」相似的紀錄，請仔細核對。`
                                : `共找到 ${searchResults.total} 筆${searchResults.searchedArea ? ` ${searchResults.searchedArea} 的` : ''}裁罰紀錄。`
                              }
                            </p>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Result Cards */}
                      {displayResults.map((result, index) => (
                        <ResultCard key={`${result.case.id}-${index}`} result={result} index={index} />
                      ))}

                      {/* Load More Button */}
                      {searchResults.hasMore && (
                        <div className="text-center py-4">
                          <Button
                            onClick={handleLoadMore}
                            disabled={isFetching}
                            variant="outline"
                            className="border-honey text-honey-dark hover:bg-honey/10"
                          >
                            {isFetching ? (
                              <>
                                <motion.div
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                  className="mr-2"
                                >
                                  <Search className="w-4 h-4" />
                                </motion.div>
                                載入中...
                              </>
                            ) : (
                              <>載入更多 (還有 {searchResults.total - displayResults.length} 筆)</>
                            )}
                          </Button>
                        </div>
                      )}

                      {/* Disclaimer */}
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {searchResults.disclaimer}
                      </p>
                    </>
                  )}
                </div>
              ) : null}
            </motion.div>
          </div>
        </section>
      )}

      {/* Quick Access Section */}
      <section className="py-12 md:py-16">
        <div className="container">
          <h2 className="text-2xl font-bold text-center text-foreground mb-8">
            快速功能
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Report */}
            <Link href="/report">
              <Card className="group cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-honey-light/30 overflow-hidden">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-warning-coral/20 rounded-2xl flex items-center justify-center group-hover:bg-warning-coral/30 transition-colors">
                    <AlertTriangle className="w-8 h-8 text-warning-coral" />
                  </div>
                  <h3 className="font-semibold text-lg text-foreground mb-2">通報事件</h3>
                  <p className="text-sm text-muted-foreground">
                    匿名通報可疑人士，共同守護兒少安全
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* Education */}
            <Link href="/education">
              <Card className="group cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-honey-light/30 overflow-hidden">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-safe-green/20 rounded-2xl flex items-center justify-center group-hover:bg-safe-green/30 transition-colors">
                    <BookOpen className="w-8 h-8 text-safe-green" />
                  </div>
                  <h3 className="font-semibold text-lg text-foreground mb-2">教育專區</h3>
                  <p className="text-sm text-muted-foreground">
                    學習辨識騷擾徵兆，與孩子討論安全界線
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-12 bg-secondary/30">
        <div className="container">
          <h2 className="text-2xl font-bold text-center text-foreground mb-8">
            如何使用
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { step: 1, title: '輸入姓名', desc: '輸入要查詢的陪玩/保母姓名' },
              { step: 2, title: '選擇地區', desc: '可選擇特定地區縮小範圍' },
              { step: 3, title: '查看結果', desc: '系統會顯示相似度比對結果' },
              { step: 4, title: '謹慎判斷', desc: '資料僅供參考，請綜合評估' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-honey text-amber-deep rounded-full flex items-center justify-center font-bold text-lg">
                  {item.step}
                </div>
                <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer with Disclaimer */}
      <footer className="mt-auto py-8 bg-amber-deep text-white">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            {/* Disclaimer */}
            <div className="bg-white/10 rounded-xl p-6 mb-6">
              <div className="flex items-start gap-3">
                <Shield className="w-6 h-6 text-honey flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-honey mb-2">重要聲明</h3>
                  <ul className="text-sm text-white/80 space-y-2">
                    <li>• 本平台資料僅供參考，<strong className="text-white">非絕對比對、僅供參考</strong></li>
                    <li>• 不揭露個資：不提供完整姓名、地址、照片等識別資訊</li>
                    <li>• 標示為非證實內容：如資料源為新聞或網友爆料，會註明「尚未經司法定讞」</li>
                    <li>• 提供澄清機制：若某人被模糊比對，應可申請澄清與註記</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Footer Links */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-white/70">
              <div className="flex items-center gap-2">
                <img src="/images/bee-mascot.png" alt="守護小蜂" className="w-8 h-8" />
                <span>© 2024 兒少守護小蜂</span>
              </div>
              <div className="flex items-center gap-6">
                <Link href="/about" className="hover:text-white transition-colors">關於我們</Link>
                <Link href="/privacy" className="hover:text-white transition-colors">隱私政策</Link>
                <Link href="/terms" className="hover:text-white transition-colors">使用條款</Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Result Card Component
interface ResultCardProps {
  result: {
    case: {
      id: number;
      maskedName: string;
      role: string;
      riskTags: string[];
      location: string;
      caseDate?: string | null;
      sourceType: string;
      sourceLink?: string | null;
      description?: string | null;
      verified: boolean;
    };
    similarity: number;
    matchType: 'exact' | 'high' | 'medium' | 'low';
  };
  index: number;
}

function ResultCard({ result, index }: ResultCardProps) {
  const { case: caseData, similarity, matchType } = result;
  
  const getSimilarityColor = () => {
    if (matchType === 'exact' || matchType === 'high') return 'text-destructive';
    if (matchType === 'medium') return 'text-warning-coral';
    return 'text-muted-foreground';
  };

  const getSimilarityBg = () => {
    if (matchType === 'exact' || matchType === 'high') return 'bg-destructive/10';
    if (matchType === 'medium') return 'bg-warning-coral/10';
    return 'bg-muted';
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <Card className="border-l-4 border-l-warning-coral hover:shadow-md transition-shadow">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            {/* Left: Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-semibold text-foreground">
                  {caseData.maskedName}
                </h3>
                <Badge variant="outline" className={`${getSimilarityBg()} ${getSimilarityColor()} border-0`}>
                  相似度 {similarity}%
                </Badge>
                {matchType === 'high' && (
                  <Badge variant="destructive" className="animate-pulse">
                    高度相似
                  </Badge>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge variant="secondary">{caseData.role}</Badge>
                <Badge variant="outline" className="text-muted-foreground">
                  <MapPin className="w-3 h-3 mr-1" />
                  {caseData.location}
                </Badge>
              </div>

              {/* Risk Tags */}
              <div className="flex flex-wrap gap-2 mb-3">
                {caseData.riskTags.map((tag) => (
                  <Badge 
                    key={tag} 
                    variant="destructive"
                    className="bg-destructive/15 text-destructive hover:bg-destructive/20"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>

              {caseData.description && (
                <p className="text-sm text-muted-foreground">
                  {caseData.description}
                </p>
              )}
            </div>

            {/* Right: Source & Date */}
            <div className="flex flex-col items-end gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge 
                  variant={caseData.verified ? 'default' : 'secondary'}
                  className={caseData.verified ? 'bg-honey text-amber-deep' : ''}
                >
                  {sourceIcons[caseData.sourceType]}
                  <span className="ml-1">{caseData.sourceType}</span>
                </Badge>
                {!caseData.verified && (
                  <span className="text-xs text-muted-foreground">(未證實)</span>
                )}
              </div>
              {caseData.caseDate && (
                <span className="text-muted-foreground">{caseData.caseDate}</span>
              )}
              {caseData.sourceLink && (
                <a 
                  href={caseData.sourceLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-honey-dark hover:underline flex items-center gap-1"
                >
                  查看來源 <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
