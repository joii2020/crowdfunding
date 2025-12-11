import React from "react";

interface FundingProgressProps {
  raised: string;
  goal: string;
}

const FundingProgress: React.FC<FundingProgressProps> = ({ raised, goal }) => {
  const percentage = Math.min((+raised / +goal) * 100, 100);

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm text-gray-600 mb-2">
        <div className="flex gap-2">
          <span>{raised} raised</span>
          <span>{goal} goal</span>
          <span>{"(CKB)"}</span>
        </div>
        <div className="text-center text-lg font-semibold text-gray-800">
          {percentage.toFixed(0)}% funded
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
        <div
          className="bg-green-600 h-4 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};

export default FundingProgress;
