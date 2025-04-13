"use client";

import {
  faCalendarAlt,
  faCheckCircle,
  faFireFlameCurved,
  faGraduationCap,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ArrowRightIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ReactNode, useState, useEffect } from "react";
import { Button } from "~/components/ui/button";
import { Footer } from "~/components/Footer";

export default function Page() {
  const [hasExistingData, setHasExistingData] = useState(false);

  useEffect(() => {
    const storedCourses = localStorage.getItem('semester-courses');
    if (storedCourses && Object.keys(JSON.parse(storedCourses)).length > 0) {
      setHasExistingData(true);
    }
  }, []);

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="pt-24 pb-16 md:pt-36 md:pb-24 flex items-center justify-center relative overflow-hidden">
        {/* Background mosaic pattern */}
        <div className="absolute inset-0 z-0 opacity-10">
          <div className="relative w-full h-full">
            <Image
              src="/mosaic3.svg"
              alt="Mosaic pattern"
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>

        <div className="container mx-auto px-4 text-center z-10 relative">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Your CS Degree <span className="text-primary">Simplifed</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-3xl mx-auto">
            A smart 4-year planner designed specifically for UMD CS students to map
            out their courses, track requirements, and graduate on time.
          </p>
          <div className="flex gap-4 justify-center mb-12">
            <Button
              asChild
              size="lg"
              className="rounded-full text-lg flex gap-2 items-center group"
            >
              <Link href={hasExistingData ? "/degree" : "/transcript"}>
                <span>Enter App</span>
                <ArrowRightIcon className="group-hover:translate-x-2 duration-100 transition-transform" />
              </Link>
            </Button>

            <Button
              asChild
              size="lg"
              className="rounded-full text-lg items-center flex"
              variant="outline"
            >
              <a href="#about">Learn More</a>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-20 bg-secondary">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Le Feature 1 */}
            <FeatureCard
              title="4-Year Planning"
              icon={
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              }
            >
              Easily map out your entire academic journey semester by semester
              to ensure you&apos;re on track to graduate.
            </FeatureCard>

            {/* Da Feature 2 */}
            <FeatureCard
              title="Schedule Making"
              icon={
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              }
            >
              {" "}
              Plan your schedule for next semester with our intuitive tracking
              system.
            </FeatureCard>

            {/* Da Feature 3 */}
            <FeatureCard
              title="Requirement Tracking"
              icon={
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
            >
              Monitor your progress towards graduation with automatic
              requirement tracking.
            </FeatureCard>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-center mb-12">
              <div className="w-12 h-1 bg-primary rounded-full mr-4"></div>
              <h2 className="text-3xl font-bold">About Terpsicle</h2>
              <div className="w-12 h-1 bg-primary rounded-full ml-4"></div>
            </div>

            <div className="mb-10 text-center">
              <p className="mb-6 text-muted-foreground leading-relaxed text-lg">
                Terpsicle is a student-built platform designed to take the
                stress out of planning your academic journey at UMD.
              </p>

              <p className="text-muted-foreground leading-relaxed text-lg">
                A tool made by terps, for terps, because we&apos;re tired of
                alt-tabbing every semester to figure out what courses we&apos;re
                taking for the next 2 years. Take the stress out of planning
                your academic journey at UMD.
              </p>
            </div>

            <div className="mb-12">
              <div className="flex items-center justify-center mb-4">
                <div className="w-10 h-10 bg-secondary-foreground/10 rounded-full flex items-center justify-center mr-3">
                  <FontAwesomeIcon icon={faCalendarAlt} />
                </div>
                <h3 className="text-xl font-semibold">Course Scheduler</h3>
              </div>

              <p className="text-muted-foreground leading-relaxed text-center">
                With our course scheduler, you can map out future semesters,
                explore different class combinations, and see how everything
                fits into your week. Think Venus and Coursice, but better
                tailored to UMD curriculum.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-center mb-4">
                <div className="w-10 h-10 bg-secondary-foreground/10 rounded-full flex items-center justify-center mr-3">
                  <FontAwesomeIcon icon={faCheckCircle} />
                </div>
                <h3 className="text-xl font-semibold">Degree Audit</h3>
              </div>

              <p className="text-muted-foreground leading-relaxed text-center">
                We also have our degree audit tool which breaks down what your
                major actually needs and which core classes you should be
                taking. Helping make sure you&apos;re on track to graduate.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* feet */}
      <Footer/>
    </main>
  );
}

function FeatureCard({
  title,
  icon,
  children,
}: {
  title: ReactNode;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="p-6 rounded-xl bg-secondary/50 backdrop-blur-md transition-shadow border ">
      <div className="w-12 h-12 bg-secondary-foreground/10 rounded-full flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}
