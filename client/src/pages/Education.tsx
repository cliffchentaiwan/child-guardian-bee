/**
 * 兒少守護小蜂 - 教育專區頁面
 * Design: 溫暖守護者 (Warm Guardian) Style
 * Features: Safety Education Tips for Parents
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  BookOpen,
  AlertCircle,
  MessageCircle,
  Eye,
  Heart,
  Shield,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Phone,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const warningSignsData = [
  {
    category: '行為變化',
    icon: AlertCircle,
    color: 'text-warning-coral',
    bgColor: 'bg-warning-coral/10',
    signs: [
      '突然變得退縮、不愛說話',
      '對特定人物或地點表現出恐懼',
      '睡眠問題：惡夢、失眠、尿床',
      '飲食習慣突然改變',
      '學業成績突然下滑',
      '不願意去原本喜歡的活動'
    ]
  },
  {
    category: '身體徵兆',
    icon: Eye,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    signs: [
      '身上出現不明瘀傷或傷痕',
      '私密部位紅腫或不適',
      '頻繁抱怨頭痛或肚子痛',
      '衣物損壞或髒污',
      '對身體接觸過度敏感'
    ]
  },
  {
    category: '情緒反應',
    icon: Heart,
    color: 'text-honey-dark',
    bgColor: 'bg-honey/10',
    signs: [
      '情緒起伏大、容易哭泣',
      '過度焦慮或恐懼',
      '出現攻擊性行為',
      '自我傷害傾向',
      '對性相關話題異常了解或好奇'
    ]
  }
];

const talkingTipsData = [
  {
    title: '建立信任的對話環境',
    tips: [
      '選擇孩子放鬆的時刻，如睡前或散步時',
      '用平靜、不帶批判的語氣',
      '讓孩子知道無論發生什麼，你都愛他們',
      '不要急著給建議，先傾聽'
    ]
  },
  {
    title: '教導身體自主權',
    tips: [
      '教導「好的觸碰」和「不好的觸碰」的區別',
      '讓孩子知道私密部位只有自己可以碰',
      '練習說「不」的權利',
      '強調任何讓他們不舒服的觸碰都可以拒絕'
    ]
  },
  {
    title: '建立安全通報機制',
    tips: [
      '告訴孩子如果有人傷害他們，一定要告訴信任的大人',
      '列出可以求助的對象：父母、老師、警察',
      '強調說出來不會被責備',
      '定期詢問孩子在學校或活動中的感受'
    ]
  }
];

const resourcesData = [
  {
    name: '113 保護專線',
    description: '24 小時全國保護專線',
    phone: '113',
    type: '緊急求助'
  },
  {
    name: '1925 安心專線',
    description: '心理諮詢服務',
    phone: '1925',
    type: '心理支持'
  },
  {
    name: '兒童福利聯盟',
    description: '兒童保護倡議與服務',
    link: 'https://www.children.org.tw',
    type: '資源連結'
  },
  {
    name: '勵馨基金會',
    description: '性侵害防治與服務',
    link: 'https://www.goh.org.tw',
    type: '資源連結'
  }
];

const faqData = [
  {
    question: '如何判斷孩子是否遭受不當對待？',
    answer: '觀察孩子的行為、情緒和身體變化。如果孩子突然變得退縮、對特定人物恐懼、或身上出現不明傷痕，都需要特別留意。最重要的是保持開放的溝通，讓孩子知道可以安全地告訴你任何事情。'
  },
  {
    question: '孩子告訴我被傷害了，我該怎麼做？',
    answer: '首先，保持冷靜，不要在孩子面前表現出驚慌或憤怒。告訴孩子你相信他們，這不是他們的錯。記錄孩子說的話，但不要反覆詢問細節。盡快聯繫專業機構（如 113 專線）尋求協助。'
  },
  {
    question: '如何選擇安全的保母或陪玩人員？',
    answer: '除了使用本平台查詢外，建議：1) 要求查看身份證件和相關證照 2) 詢問過去的工作經歷和推薦人 3) 進行面談並觀察互動方式 4) 初期不要讓孩子單獨相處 5) 定期與孩子溝通感受。'
  },
  {
    question: '發現可疑情況但不確定，該通報嗎？',
    answer: '如果您有任何疑慮，建議先諮詢專業機構（如 113 專線）。專業人員會協助您判斷情況並提供建議。寧可多一份警覺，也不要忽視可能的危險信號。'
  }
];

export default function Education() {
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
              <BookOpen className="w-5 h-5 text-safe-green" />
              <span className="font-bold text-lg text-amber-deep">教育專區</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container py-6">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
          >
            <img 
              src="/images/education-illustration.png" 
              alt="親子安全教育" 
              className="w-full max-w-md mx-auto mb-6 rounded-2xl shadow-lg"
            />
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
              守護孩子，從了解開始
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              學習辨識騷擾徵兆、與孩子討論安全界線，是每位家長的重要課題。
              以下資源將幫助您建立更安全的親子關係。
            </p>
          </motion.div>

          {/* Warning Signs Section */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-warning-coral" />
              辨識騷擾徵兆
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {warningSignsData.map((category, index) => (
                <motion.div
                  key={category.category}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="h-full">
                    <CardHeader className="pb-3">
                      <div className={`w-12 h-12 rounded-xl ${category.bgColor} flex items-center justify-center mb-3`}>
                        <category.icon className={`w-6 h-6 ${category.color}`} />
                      </div>
                      <CardTitle className="text-lg">{category.category}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {category.signs.map((sign, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                            <span className={`w-1.5 h-1.5 rounded-full ${category.bgColor.replace('/10', '')} mt-2 flex-shrink-0`} />
                            {sign}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Talking Tips Section */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-honey-dark" />
              如何與孩子討論安全界線
            </h2>
            <div className="space-y-4">
              {talkingTipsData.map((section, index) => (
                <motion.div
                  key={section.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-honey text-amber-deep flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </span>
                        {section.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {section.tips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                            <Shield className="w-4 h-4 text-safe-green flex-shrink-0 mt-0.5" />
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Resources Section */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <Users className="w-6 h-6 text-safe-green" />
              求助資源
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {resourcesData.map((resource, index) => (
                <motion.div
                  key={resource.name}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground">{resource.name}</h3>
                          <Badge variant="secondary" className="text-xs">
                            {resource.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{resource.description}</p>
                      </div>
                      {resource.phone ? (
                        <a 
                          href={`tel:${resource.phone}`}
                          className="flex items-center gap-2 bg-honey hover:bg-honey-dark text-amber-deep px-4 py-2 rounded-xl font-semibold transition-colors"
                        >
                          <Phone className="w-4 h-4" />
                          {resource.phone}
                        </a>
                      ) : (
                        <a 
                          href={resource.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-honey-dark hover:underline"
                        >
                          前往 <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>

          {/* FAQ Section */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-honey-dark" />
              常見問題
            </h2>
            <Card>
              <CardContent className="p-0">
                <Accordion type="single" collapsible className="w-full">
                  {faqData.map((faq, index) => (
                    <AccordionItem key={index} value={`item-${index}`} className="border-b border-border/50 last:border-0">
                      <AccordionTrigger className="px-6 py-4 hover:bg-secondary/30 text-left">
                        <span className="font-medium text-foreground">{faq.question}</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-6 pb-4 text-foreground/80">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </section>

          {/* CTA Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <Card className="bg-gradient-to-r from-honey/20 to-honey-light/20 border-honey/30">
              <CardContent className="p-8">
                <img 
                  src="/images/bee-mascot.png" 
                  alt="守護小蜂" 
                  className="w-16 h-16 mx-auto mb-4"
                />
                <h3 className="text-xl font-bold text-foreground mb-2">
                  一起守護兒少安全
                </h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  如果您發現任何可疑情況，請立即通報。
                  您的一個行動，可能拯救一個孩子。
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button asChild className="bg-honey hover:bg-honey-dark text-amber-deep">
                    <Link href="/report">通報可疑人士</Link>
                  </Button>
                  <Button asChild variant="outline" className="border-honey text-honey-dark">
                    <Link href="/">查詢資料庫</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 bg-amber-deep text-white/70 text-sm text-center mt-8">
        <div className="container">
          <p>© 2024 兒少守護小蜂 | 資料僅供參考，非絕對比對</p>
        </div>
      </footer>
    </div>
  );
}
