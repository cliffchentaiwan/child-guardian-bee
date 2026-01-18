/**
 * 兒少守護小蜂 - 通報事件頁面
 * Design: 溫暖守護者 (Warm Guardian) Style
 * Features: Anonymous Reporting Form with Backend Integration
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  AlertTriangle, 
  Shield,
  Upload,
  Send,
  CheckCircle,
  Info,
  EyeOff,
  FileText,
  MapPin,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

const incidentTypes = [
  '性騷擾',
  '不當觸碰',
  '偷拍',
  '言語暴力',
  '情緒虐待',
  '肢體暴力',
  '疏忽照顧',
  '其他'
];

const roleTypes = [
  '家教老師',
  '保母',
  '陪玩人員',
  '才藝老師',
  '安親班老師',
  '補習班老師',
  '游泳教練',
  '其他'
];

export default function Report() {
  const [formData, setFormData] = useState({
    suspectName: '',
    suspectRole: '',
    incidentType: '',
    location: '',
    description: '',
    hasEvidence: false,
    agreeTerms: false
  });
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // 使用 tRPC 提交通報
  const submitMutation = trpc.report.submit.useMutation({
    onSuccess: (data) => {
      setIsSubmitted(true);
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(error.message || '通報送出失敗，請稍後再試');
    },
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles].slice(0, 5)); // Max 5 files
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.agreeTerms) {
      toast.error('請先同意通報須知');
      return;
    }

    if (!formData.suspectName || !formData.incidentType || !formData.description) {
      toast.error('請填寫必要欄位');
      return;
    }

    if (formData.description.length < 10) {
      toast.error('事件描述請至少填寫 10 個字');
      return;
    }

    // 組合描述（包含角色和事件類型）
    const fullDescription = `[${formData.incidentType}] ${formData.suspectRole ? `(${formData.suspectRole}) ` : ''}${formData.description}`;

    submitMutation.mutate({
      suspectName: formData.suspectName,
      location: formData.location || undefined,
      description: fullDescription,
      // TODO: 實作檔案上傳後加入 attachments
    });
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex flex-col bg-cream">
        {/* Header */}
        <header className="sticky top-0 z-50 backdrop-blur-md border-b border-honey-light/30" style={{ backgroundColor: 'oklch(0.985 0.015 90 / 0.8)' }}>
          <div className="container py-3 flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                返回首頁
              </Button>
            </Link>
          </div>
        </header>

        {/* Success Message */}
        <main className="flex-1 flex items-center justify-center p-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center max-w-md"
          >
            <div className="w-20 h-20 mx-auto mb-6 bg-safe-green/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-safe-green" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-4">
              通報已成功送出
            </h1>
            <p className="text-muted-foreground mb-6">
              感謝您的通報，我們的團隊將會審核您提供的資訊。
              審核通過後，相關資料將會被加入資料庫以保護更多兒童。
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild className="bg-honey hover:bg-honey-dark text-amber-deep">
                <Link href="/">返回首頁</Link>
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsSubmitted(false);
                  setFormData({
                    suspectName: '',
                    suspectRole: '',
                    incidentType: '',
                    location: '',
                    description: '',
                    hasEvidence: false,
                    agreeTerms: false
                  });
                  setFiles([]);
                }}
              >
                繼續通報
              </Button>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b border-honey-light/30" style={{ backgroundColor: 'oklch(0.985 0.015 90 / 0.8)' }}>
        <div className="container py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                返回首頁
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning-coral" />
              <span className="font-bold text-lg text-amber-deep">通報事件</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container py-6">
        <div className="max-w-2xl mx-auto">
          {/* Hero Image */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <img 
              src="/images/report-illustration.png" 
              alt="通報守護" 
              className="w-32 h-32 mx-auto mb-4 object-contain"
            />
            <h1 className="text-2xl font-bold text-foreground mb-2">
              匿名通報可疑人士
            </h1>
            <p className="text-muted-foreground">
              您的通報將幫助我們建立更完整的資料庫，共同守護兒少安全
            </p>
          </motion.div>

          {/* Warning Notice */}
          <Card className="mb-6 bg-warning-coral/10 border-warning-coral/30">
            <CardContent className="p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-warning-coral flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-warning-coral mb-1">通報須知</p>
                <ul className="text-foreground/70 space-y-1">
                  <li>• 所有通報將經過審核後才會上架</li>
                  <li>• 請提供真實資訊，惡意通報將負法律責任</li>
                  <li>• 通報過程完全匿名，不會記錄您的個人資訊</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Report Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-honey-dark" />
                通報表單
              </CardTitle>
              <CardDescription>
                請盡可能提供詳細資訊，以利審核
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Suspect Name */}
                <div className="space-y-2">
                  <Label htmlFor="suspectName" className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    可疑人士姓名 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="suspectName"
                    placeholder="請輸入姓名或暱稱"
                    value={formData.suspectName}
                    onChange={(e) => handleInputChange('suspectName', e.target.value)}
                    className="border-2 border-honey-light/50 focus:border-honey"
                  />
                  <p className="text-xs text-muted-foreground">
                    系統會自動遮罩中間字元以保護隱私
                  </p>
                </div>

                {/* Role */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    身份角色
                  </Label>
                  <Select 
                    value={formData.suspectRole} 
                    onValueChange={(value) => handleInputChange('suspectRole', value)}
                  >
                    <SelectTrigger className="border-2 border-honey-light/50 focus:border-honey">
                      <SelectValue placeholder="選擇角色類型" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleTypes.map(role => (
                        <SelectItem key={role} value={role}>{role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Incident Type */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    事件類型 <span className="text-destructive">*</span>
                  </Label>
                  <Select 
                    value={formData.incidentType} 
                    onValueChange={(value) => handleInputChange('incidentType', value)}
                  >
                    <SelectTrigger className="border-2 border-honey-light/50 focus:border-honey">
                      <SelectValue placeholder="選擇事件類型" />
                    </SelectTrigger>
                    <SelectContent>
                      {incidentTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Location */}
                <div className="space-y-2">
                  <Label htmlFor="location" className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    發生地點
                  </Label>
                  <Input
                    id="location"
                    placeholder="例如：台北市士林區某國小附近"
                    value={formData.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    className="border-2 border-honey-light/50 focus:border-honey"
                  />
                  <p className="text-xs text-muted-foreground">
                    請勿提供精確地址，僅需區域範圍
                  </p>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description" className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    事件描述 <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="description"
                    placeholder="請描述事件經過，包含時間、情況等...（至少 10 個字）"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className="min-h-[120px] border-2 border-honey-light/50 focus:border-honey"
                  />
                  <p className="text-xs text-muted-foreground">
                    已輸入 {formData.description.length} 字
                  </p>
                </div>

                {/* File Upload */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    上傳證據（選填）
                  </Label>
                  <div className="border-2 border-dashed border-honey-light/50 rounded-xl p-6 text-center hover:border-honey transition-colors">
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={handleFileChange}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        點擊上傳或拖曳檔案至此
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        支援圖片、PDF、Word（最多 5 個檔案）
                      </p>
                    </label>
                  </div>
                  
                  {/* File List */}
                  {files.length > 0 && (
                    <div className="space-y-2 mt-3">
                      {files.map((file, index) => (
                        <div 
                          key={index}
                          className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2"
                        >
                          <span className="text-sm truncate">{file.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                            className="text-destructive hover:text-destructive"
                          >
                            移除
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Terms Agreement */}
                <div className="flex items-start gap-3 p-4 bg-secondary/30 rounded-xl">
                  <Checkbox
                    id="terms"
                    checked={formData.agreeTerms}
                    onCheckedChange={(checked) => handleInputChange('agreeTerms', checked as boolean)}
                  />
                  <label htmlFor="terms" className="text-sm text-foreground/80 cursor-pointer">
                    我了解通報內容將經過審核，且我保證所提供的資訊為真實。
                    我同意遵守平台使用規範，不進行惡意通報。
                  </label>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={submitMutation.isPending || !formData.agreeTerms}
                  className="w-full h-12 bg-honey hover:bg-honey-dark text-amber-deep font-semibold rounded-xl"
                >
                  {submitMutation.isPending ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="flex items-center gap-2"
                    >
                      <Send className="w-5 h-5" />
                      送出中...
                    </motion.div>
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" />
                      送出通報
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Privacy Notice */}
          <Card className="mt-6 bg-honey/10 border-honey/30">
            <CardContent className="p-4 flex items-start gap-3">
              <EyeOff className="w-5 h-5 text-honey-dark flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-honey-dark mb-1">匿名保護</p>
                <p className="text-foreground/70">
                  本平台僅記錄必要的技術資訊以防止濫用，不會公開您的身份。
                  您的通報將完全匿名處理。
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 bg-amber-deep text-white/70 text-sm text-center">
        <div className="container">
          <p>© 2024 兒少守護小蜂 | 資料僅供參考，非絕對比對</p>
        </div>
      </footer>
    </div>
  );
}
