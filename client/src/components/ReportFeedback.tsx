import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Send, CheckCircle } from "lucide-react";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

interface FeedbackData {
  id: number;
  rating: number;
  comment: string | null;
}

export default function ReportFeedback({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: existing } = useQuery<FeedbackData | null>({
    queryKey: ["/api/feedback", sessionId],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // Pre-fill from existing
  if (existing && rating === 0 && !submitted) {
    setRating(existing.rating);
    if (existing.comment) setComment(existing.comment);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/feedback", {
        courseSessionId: sessionId,
        rating,
        comment: comment || null,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/feedback", sessionId] });
    },
  });

  return (
    <Card dir="rtl" className="border-0 shadow-sm mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-gray-700">
          تقييم التقرير
        </CardTitle>
        <p className="text-xs text-gray-500">
          ساعدنا في تحسين التقارير — كيف كان هذا التقرير؟
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {submitted ? (
          <div className="flex items-center gap-2 text-green-600 py-4">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">شكراً لتقييمك!</span>
          </div>
        ) : (
          <>
            {/* Star Rating */}
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="p-1 transition-transform hover:scale-110"
                  onMouseEnter={() => setHoveredStar(star)}
                  onMouseLeave={() => setHoveredStar(0)}
                  onClick={() => setRating(star)}
                >
                  <Star
                    className={`w-7 h-7 ${
                      star <= (hoveredStar || rating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Comment */}
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="أي ملاحظات أو اقتراحات؟ (اختياري)"
              className="resize-none text-sm"
              rows={3}
            />

            <Button
              onClick={() => mutation.mutate()}
              disabled={rating === 0 || mutation.isPending}
              size="sm"
              className="bg-teal-600 hover:bg-teal-700"
            >
              {mutation.isPending ? (
                "جاري الإرسال..."
              ) : (
                <>
                  <Send className="w-4 h-4 ml-1" />
                  إرسال التقييم
                </>
              )}
            </Button>

            {mutation.isError && (
              <p className="text-xs text-red-500">حدث خطأ في إرسال التقييم</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
